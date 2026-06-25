import { Client, GatewayIntentBits, REST, Routes, Events, Interaction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { config } from './config';
import type { AppServices } from './types';

// Services
import { EconomyService } from './services/EconomyService';
import { UserService }    from './services/UserService';
import { CrateService }   from './services/CrateService';
import { GamblingService } from './services/GamblingService';
import { BookingService } from './services/BookingService';
import { ProviderStatsService } from './services/ProviderStatsService';
import { BlacklistService } from './services/BlacklistService';

// Command handlers
import * as Economy  from './commands/economy';
import * as Crates   from './commands/crates';
import * as Gambling from './commands/gambling';
import * as Book from './commands/book';
import * as ProviderStats from './commands/provider-stats';
import * as ProviderLeaderboard from './commands/provider-leaderboard';
import * as Blacklist from './commands/blacklist';

// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

const services: AppServices = {
  economy:  new EconomyService(),
  user:     new UserService(),
  crate:    new CrateService(),
  gambling: new GamblingService(),
  booking:  new BookingService(),
  providerStats: new ProviderStatsService(),
  blacklist: new BlacklistService(),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
//  SLASH COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

async function registerCommands(): Promise<void> {
  const commands = [
    Economy.data,
    Economy.payData,
    Economy.tipData,
    Economy.dailyData,
    Economy.statsData,
    Economy.rankData,
    Economy.transactionsData,
    Economy.leaderboardData,
    Economy.inventoryData,
    Crates.data,
    Gambling.coinflipData,
    Gambling.diceData,
    Gambling.blackjackData,
    Book.data,
    ProviderStats.data,
    ProviderLeaderboard.data,
    Blacklist.data,
  ].map((c) => c.toJSON());

  const rest = new REST().setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands });
  console.log(`[Bot] Registered ${commands.length} slash commands.`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // ── Button interactions ──────────────────────────────────────────────
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;
      const id = btn.customId;

      if (id.startsWith('bj:')) {
        await Gambling.handleBlackjackButton(btn, services);
        return;
      }
      if (id.startsWith('crate:')) {
        await Crates.handleCrateButton(btn, services);
        return;
      }
      if (id.startsWith('gudhrides-book:')) {
        await Book.handleBookButton(btn, services);
        return;
      }
      if (id.startsWith('gudhrides-booking:')) {
        await Book.handleBookingActionButton(btn, services);
        return;
      }
      if (id.startsWith('gudhrides-review:')) {
        await Book.handleReviewButton(btn, services);
        return;
      }
      return;
    }

    // ── Modal submissions ────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const modal = interaction as ModalSubmitInteraction;
      if (modal.customId.startsWith('gudhrides-book-')) {
        await Book.handleBookModal(modal, services);
        return;
      }
      return;
    }

    // ── Slash commands ───────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case 'balance':      await Economy.handleBalance(interaction, services);      break;
      case 'pay':          await Economy.handlePay(interaction, services);          break;
      case 'tip':          await Economy.handleTip(interaction, services);          break;
      case 'daily':        await Economy.handleDaily(interaction, services);        break;
      case 'stats':        await Economy.handleStats(interaction, services);        break;
      case 'rank':         await Economy.handleRank(interaction, services);         break;
      case 'transactions': await Economy.handleTransactions(interaction, services); break;
      case 'leaderboard':  await Economy.handleLeaderboard(interaction, services);  break;
      case 'inventory':    await Economy.handleInventory(interaction, services);    break;
      case 'crate':        await Crates.execute(interaction, services);             break;
      case 'coinflip':     await Gambling.handleCoinflip(interaction, services);    break;
      case 'dice':         await Gambling.handleDice(interaction, services);        break;
      case 'blackjack':    await Gambling.handleBlackjack(interaction, services);   break;
      case 'book':         await Book.execute(interaction, services);                break;
      case 'provider-stats': await ProviderStats.handleProviderStats(interaction, services); break;
      case 'provider-leaderboard': await ProviderLeaderboard.handleProviderLeaderboard(interaction, services); break;
      case 'blacklist':    await Blacklist.handleBlacklist(interaction, services); break;
      default:
        console.warn(`[Bot] Unknown command: ${interaction.commandName}`);
    }
  } catch (err) {
    console.error('[Bot] Unhandled interaction error:', err);
    const msg = '`An error occurred. Please try again.`';
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: msg, ephemeral: true });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      }
    } catch { /* ignore reply errors */ }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════════════════

client.once(Events.ClientReady, async (c) => {
  console.log(`[Bot] Logged in as ${c.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('[Bot] Failed to register commands:', err);
  }
});

client.login(config.token).catch((err) => {
  console.error('[Bot] Login failed:', err);
  process.exit(1);
});
