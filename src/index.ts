import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  Interaction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { config } from './config';
import type { AppServices } from './types';

// ── Economy / Gambling / Crate services ──────────────────────────────────────
import { EconomyService }  from './services/EconomyService';
import { UserService }     from './services/UserService';
import { CrateService }    from './services/CrateService';
import { GamblingService } from './services/GamblingService';

// ── Command handlers ──────────────────────────────────────────────────────────
import * as Economy  from './commands/economy';
import * as Crates   from './commands/crates';
import * as Gambling from './commands/gambling';
import * as Ride     from './commands/ride/ride';
import * as Booking  from './commands/booking/book';

// ── Ride component handlers ───────────────────────────────────────────────────
import { handleRideButton }                         from './components/buttons/rideButtons';
import { handleStep1, handleStep5, handleStep6 }   from './components/selectMenus/rideSelectMenus';
import { handlePickupModal, handleDropoffModal, handleFareModal } from './components/modals/rideModals';

// ── Booking component handlers ────────────────────────────────────────────────
import { handleBookingButton }                                          from './components/buttons/bookingButtons';
import { handleServiceSelect, handleDeliveryTimeSelect, handlePaymentMethodSelect } from './components/selectMenus/bookingSelectMenus';
import { handleAmountModal, handleAddressModal }                        from './components/modals/bookingModals';

// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

const services: AppServices = {
  economy:  new EconomyService(),
  user:     new UserService(),
  crate:    new CrateService(),
  gambling: new GamblingService(),
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
    Ride.data,
    Booking.data,
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
      if (btn.customId.startsWith('bj:'))    { await Gambling.handleBlackjackButton(btn, services); return; }
      if (btn.customId.startsWith('crate:')) { await Crates.handleCrateButton(btn, services);       return; }
      if (btn.customId.startsWith('ride:'))  { await handleRideButton(btn);                         return; }
      if (btn.customId.startsWith('book:'))  { await handleBookingButton(btn);                      return; }
      return;
    }

    // ── Select menu interactions ─────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const sel = interaction as StringSelectMenuInteraction;
      if (sel.customId.startsWith('ride:step1:'))        { await handleStep1(sel); return; }
      if (sel.customId.startsWith('ride:step5:'))        { await handleStep5(sel); return; }
      if (sel.customId.startsWith('ride:step6:'))        { await handleStep6(sel); return; }
      if (sel.customId.startsWith('book:service:'))      { await handleServiceSelect(sel); return; }
      if (sel.customId.startsWith('book:deliverytime:')) { await handleDeliveryTimeSelect(sel); return; }
      if (sel.customId.startsWith('book:payment:'))      { await handlePaymentMethodSelect(sel); return; }
      return;
    }

    // ── Modal submissions ────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const mod = interaction as ModalSubmitInteraction;
      if (mod.customId.startsWith('ride:modal:pickup:'))  { await handlePickupModal(mod);  return; }
      if (mod.customId.startsWith('ride:modal:dropoff:')) { await handleDropoffModal(mod); return; }
      if (mod.customId.startsWith('ride:modal:fare:'))    { await handleFareModal(mod);    return; }
      if (mod.customId.startsWith('book:modal:amount:'))  { await handleAmountModal(mod);  return; }
      if (mod.customId.startsWith('book:modal:address:')) { await handleAddressModal(mod); return; }
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
      case 'ride':         await Ride.execute(interaction);                         break;
      case 'booking':      await Booking.execute(interaction);                      break;
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
