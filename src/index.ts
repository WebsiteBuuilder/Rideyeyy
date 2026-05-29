import dotenv from 'dotenv';

dotenv.config();

import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  REST,
  Routes,
} from 'discord.js';
import { config, logStartupWarnings } from './config';
import { pool, runMigrations, closePool } from './database';
import { LoggerService } from './services/LoggerService';
import { EconomyService } from './services/EconomyService';
import { UserService } from './services/UserService';
import { BackupService } from './services/BackupService';
import { InviteService } from './services/InviteService';
import { GamblingService } from './services/GamblingService';
import { CrateService } from './services/CrateService';
import { RedeemService } from './services/RedeemService';
import { TicketService } from './services/TicketService';
import type { AppServices } from './types';
import { registerGuildMemberAdd } from './events/guildMemberAdd';
import { startDailySnapshotJob } from './jobs/dailySnapshotJob';
import { startInviteValidatorJob } from './jobs/inviteValidatorJob';
import { startBlackjackTimeoutJob } from './jobs/blackjackTimeoutJob';
import { startCosmeticRoleExpiryJob } from './jobs/cosmeticRoleExpiryJob';
import * as economyCmd from './commands/economy';
import * as adminCmd from './commands/admin';
import * as gamblingCmd from './commands/gambling';
import * as cratesCmd from './commands/crates';
import * as redeemCmd from './commands/redeem';
import * as ticketsCmd from './commands/tickets';
import { ephemeralReply } from './utils/discord';

const logger = new LoggerService();

async function registerCommands(): Promise<void> {
  const commands = [
    economyCmd.data.toJSON(),
    economyCmd.payData.toJSON(),
    economyCmd.transactionsData.toJSON(),
    economyCmd.leaderboardData.toJSON(),
    economyCmd.inventoryData.toJSON(),
    adminCmd.data.toJSON(),
    gamblingCmd.coinflipData.toJSON(),
    gamblingCmd.diceData.toJSON(),
    gamblingCmd.blackjackData.toJSON(),
    cratesCmd.data.toJSON(),
    redeemCmd.data.toJSON(),
    ticketsCmd.bookData.toJSON(),
    ticketsCmd.ticketData.toJSON(),
  ];

  logger.info(`Registering ${commands.length} slash commands for guild ${config.discord.guildId}`, { commandName: 'register' });

  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
    logger.info('Slash commands registered successfully', { commandName: 'register' });
  } catch (err) {
    // Log full error detail so the real cause (bad CLIENT_ID, missing scope,
    // wrong guildId, etc.) is visible in container logs.
    logger.error('Failed to register slash commands — bot will still start but commands will not appear', { commandName: 'register' });
    console.error('[register] REST error:', err);
  }
}

function buildServices(): AppServices {
  const economy = new EconomyService(pool, logger);
  const user = new UserService(pool, logger, economy);
  const backup = new BackupService(pool, economy, logger);
  const invite = new InviteService(pool, economy, user, logger);
  const gambling = new GamblingService(pool, economy, logger);
  const crate = new CrateService(pool, economy, user, logger);
  const redeem = new RedeemService(pool, economy, user, logger);
  const ticket = new TicketService(pool, user, logger);

  return { pool, logger, economy, user, backup, invite, gambling, crate, redeem, ticket };
}

async function handleInteraction(interaction: Interaction, services: AppServices): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    try {
      switch (commandName) {
        case 'balance':
          await economyCmd.handleBalance(interaction, services);
          break;
        case 'pay':
          await economyCmd.handlePay(interaction, services);
          break;
        case 'transactions':
          await economyCmd.handleTransactions(interaction, services);
          break;
        case 'leaderboard':
          await economyCmd.handleLeaderboard(interaction, services);
          break;
        case 'inventory':
          await economyCmd.handleInventory(interaction, services);
          break;
        case 'admin':
          await adminCmd.execute(interaction, services);
          break;
        case 'coinflip':
          await gamblingCmd.handleCoinflip(interaction, services);
          break;
        case 'dice':
          await gamblingCmd.handleDice(interaction, services);
          break;
        case 'blackjack':
          await gamblingCmd.handleBlackjack(interaction, services);
          break;
        case 'crate':
          await cratesCmd.execute(interaction, services);
          break;
        case 'redeem':
          await redeemCmd.execute(interaction, services);
          break;
        case 'book':
          await ticketsCmd.handleBook(interaction, services);
          break;
        case 'ticket':
          await ticketsCmd.handleTicket(interaction, services);
          break;
        default:
          await ephemeralReply(interaction, 'Unknown command.');
      }
    } catch (err) {
      services.logger.error('Command error', {
        commandName,
        userId: interaction.user.id,
      });
      const msg = err instanceof Error ? err.message : 'An error occurred.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await ephemeralReply(interaction, msg);
      }
    }
    return;
  }

  if (interaction.isButton()) {
    try {
      if (interaction.customId.startsWith('bj:')) {
        await gamblingCmd.handleBlackjackButton(interaction, services);
      } else if (interaction.customId.startsWith('crate:')) {
        await cratesCmd.handleCrateButton(interaction, services);
      }
    } catch (err) {
      services.logger.error('Button interaction error', {
        userId: interaction.user.id,
        commandName: interaction.customId,
      });
    }
  }
}

async function main(): Promise<void> {
  logger.info('Starting Rideey bot...');
  logStartupWarnings(logger);

  await runMigrations();
  const services = buildServices();

  // Always register — a failed REST call is caught inside registerCommands()
  // and will not abort startup.
  await registerCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  registerGuildMemberAdd(client, services);

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild || message.guild.id !== config.discord.guildId) return;
    try {
      await services.user.incrementMessageCount(message.author.id);
    } catch {
      /* non-critical */
    }
  });

  const vcSessions = new Map<string, number>();

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.id;
    if (newState.guild?.id !== config.discord.guildId) return;

    if (!oldState.channelId && newState.channelId) {
      vcSessions.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
      const joined = vcSessions.get(userId);
      if (joined) {
        const mins = Math.floor((Date.now() - joined) / 60000);
        if (mins > 0) {
          await services.user.addVcMinutes(userId, mins).catch(() => {});
        }
        vcSessions.delete(userId);
      }
    }
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info(`Logged in as ${c.user.tag}`);
    const guild = await c.guilds.fetch(config.discord.guildId);
    await services.invite.syncGuildInvites(guild);
    startDailySnapshotJob(services.backup, services.logger);
    startInviteValidatorJob(c, services.invite, services.logger);
    startBlackjackTimeoutJob(services.gambling, services.logger);
    startCosmeticRoleExpiryJob(c, services.pool, services.user, services.logger);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction, services).catch((err) => {
      logger.error('Unhandled interaction error', { commandName: 'interactionCreate' });
    });
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    client.destroy();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await client.login(config.discord.token);
}

main().catch((err) => {
  // Print the raw error before the logger so it's visible even if the logger
  // itself is the thing that threw.
  console.error('[fatal] Startup error:', err);
  logger.error(`Fatal startup error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`, { commandName: 'main' });
  process.exit(1);
});
