import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config';
import { CONFIRM_TIMEOUT_MS } from './constants';

// ═══════════════════════════════════════════════════════════════════════════
//  DISCORD CASINO UI KIT — Premium Design System
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Brand Identity
// ---------------------------------------------------------------------------
export const BRAND = {
  name: 'GUHD RIDES',
  currency: 'Route Cash',
  ticker: 'RC',
  tagline: 'Premium Casino',
  logo: '◈',
  icon: '🎰',
} as const;

// ---------------------------------------------------------------------------
// Color Palette — Cohesive Casino Aesthetic
// ---------------------------------------------------------------------------
export const COLOR = {
  // Primary brand
  BRAND:    0x1a1a2e,   // Deep navy — background essence
  ACCENT:   0x16213e,   // Rich navy — secondary
  
  // Casino Status Colors
  WIN:      0x00d26a,   // Emerald green — wins/success
  LOSS:     0xff4757,   // Crimson — losses
  JACKPOT:  0xffd700,   // Pure gold — jackpots/21
  EPIC:     0xe056fd,   // Vibrant purple — epic rewards
  RARE:     0x9b59b6,   // Royal purple — rare items
  
  // Game State Colors
  ACTIVE:   0x4a90d9,   // Steel blue — active games
  ELECTRIC: 0x00d4ff,   // Electric cyan — highlights
  
  // UI Colors
  INFO:     0x5865f2,   // Discord blurple — info
  NEUTRAL:  0x2f3136,   // Discord dark — neutral
  WHITE:    0xffffff,   // Clean white
  MUTED:    0x747f8d,   // Muted gray — subtle text
} as const;

// ---------------------------------------------------------------------------
// Premium Visual Elements
// ---------------------------------------------------------------------------

/** Elegant line separator */
export const LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/** Thin separator for sub-sections */
export const THIN_LINE = '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─';

/** Zero-width spacer */
export const SPACER = '\u200b';

/** Card suit icons for premium display */
export const SUITS = {
  H: { icon: '♥', color: 'red', name: 'Hearts' },
  D: { icon: '♦', color: 'red', name: 'Diamonds' },
  C: { icon: '♣', color: 'black', name: 'Clubs' },
  S: { icon: '♠', color: 'black', name: 'Spades' },
} as const;

// ---------------------------------------------------------------------------
// Casino Iconography
// ---------------------------------------------------------------------------
export const ICON = {
  // Currency & Economy
  coin:     '◈',
  coins:    '💰',
  wallet:   '👛',
  bank:     '🏦',
  
  // Games
  cards:    '🃏',
  dice:     '🎲',
  slot:     '🎰',
  chip:     '🪙',
  
  // Status
  win:      '✦',
  loss:     '✕',
  push:     '≈',
  jackpot:  '★',
  streak:   '🔥',
  
  // Actions
  hit:      '↓',
  stand:    '■',
  double:   '⬆',
  split:    '⟷',
  fold:     '↩',
  
  // Rarity
  common:   '○',
  uncommon: '◐',
  rare:     '●',
  epic:     '◆',
  legendary:'★',
  
  // Misc
  time:     '⏱',
  check:    '✓',
  cross:    '✕',
  arrow:    '→',
  up:       '↗',
  down:     '↘',
} as const;

// ---------------------------------------------------------------------------
// Progress & Meter Components
// ---------------------------------------------------------------------------

/** Premium progress bar with gradient feel */
export function progressBar(value: number, max: number, size = 12): string {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  return '`[' + '▰'.repeat(filled) + '▱'.repeat(empty) + ']`';
}

/** Animated-feel meter with percentage */
export function meter(value: number, max: number): string {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  return `${progressBar(value, max, 12)}  **${pct}%**`;
}

/** XP-style bar for streaks */
export function streakBar(current: number, max: number): string {
  const filled = Math.min(current, max);
  const empty = max - filled;
  const icons = ICON.streak.repeat(filled) + '○'.repeat(empty);
  return `${icons}  \`${current}/${max}\``;
}

// ---------------------------------------------------------------------------
// Currency & Amount Formatting
// ---------------------------------------------------------------------------

/** Standard currency display */
export function rcDisplay(amount: string): string {
  return `**${ICON.coin} ${amount}**`;
}

/** Large hero amount for big displays */
export function heroAmount(amount: string): string {
  return `# ${ICON.coin} ${amount}`;
}

/** Compact inline amount */
export function inlineRC(amount: string | number): string {
  const formatted = typeof amount === 'number' ? amount.toString() : amount;
  return `\`${ICON.coin} ${formatted}\``;
}

/** Net change with directional indicator */
export function netLabel(net: string, positive: boolean): string {
  if (positive) {
    return `\`+ ${net}\` ${ICON.up}`;
  }
  return `\`- ${net}\` ${ICON.down}`;
}

/** Large net change for results */
export function heroNet(amount: string, positive: boolean): string {
  const sign = positive ? '+' : '-';
  return `# ${sign} ${ICON.coin} ${amount}`;
}

// ---------------------------------------------------------------------------
// Stat & Field Components
// ---------------------------------------------------------------------------

/** Clean stat block for embed fields */
export function statBlock(label: string, value: string): string {
  return `\`${label}\`\n**${value}**`;
}

/** Inline stat for compact displays */
export function inlineStat(label: string, value: string): string {
  return `\`${label}:\` **${value}**`;
}

/** Key-value pair row */
export function kvRow(key: string, value: string): string {
  return `> **${key}** ${ICON.arrow} ${value}`;
}

// ---------------------------------------------------------------------------
// Status Banner Components (ANSI Code Blocks)
// ---------------------------------------------------------------------------

/** Premium status banner with ANSI colors */
export function statusBanner(text: string, style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' = 'info'): string {
  const colorCode: Record<string, string> = {
    win: '32',      // Green
    loss: '31',     // Red
    jackpot: '33',  // Gold/Yellow
    info: '36',     // Cyan
    neutral: '37',  // White
  };
  return `\`\`\`ansi\n[1;${colorCode[style]}m${text}[0m\n\`\`\``;
}

/** Game result banner */
export function resultBanner(result: 'win' | 'loss' | 'push' | 'jackpot' | 'bust' | 'surrender'): string {
  const banners: Record<string, { text: string; style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' }> = {
    win:       { text: '✦  WINNER  ✦', style: 'win' },
    loss:      { text: '✕  DEALER WINS  ✕', style: 'loss' },
    push:      { text: '≈  PUSH  ≈', style: 'neutral' },
    jackpot:   { text: '★  BLACKJACK  ★', style: 'jackpot' },
    bust:      { text: '✕  BUST  ✕', style: 'loss' },
    surrender: { text: '↩  SURRENDERED  ↩', style: 'neutral' },
  };
  const { text, style } = banners[result] ?? banners.loss;
  return statusBanner(text, style);
}

// ---------------------------------------------------------------------------
// Card Display Components
// ---------------------------------------------------------------------------

/** Premium single card display */
export function cardDisplay(rank: string, suit: string): string {
  const suitData = SUITS[suit as keyof typeof SUITS] ?? { icon: suit, color: 'black' };
  return `\`[ ${rank}${suitData.icon} ]\``;
}

/** Hidden card display */
export function hiddenCard(): string {
  return '`[ ?? ]`';
}

/** Hand display with cards */
export function handDisplay(cards: Array<{ rank: string; suit: string }>, hideIndex?: number): string {
  return cards
    .map((card, i) => (i === hideIndex ? hiddenCard() : cardDisplay(card.rank, card.suit)))
    .join('  ');
}

/** Hand value display with special states */
export function handValue(value: number, revealed: boolean): string {
  if (!revealed) return '`Value: ??`';
  if (value === 21) return '**21** `BLACKJACK`';
  if (value > 21) return `**${value}** \`BUST\``;
  return `**${value}**`;
}

// ---------------------------------------------------------------------------
// Table Layout Components
// ---------------------------------------------------------------------------

/** Casino table header */
export function tableHeader(title: string): string {
  return `## ${ICON.cards} ${title}\n${LINE}`;
}

/** Dealer section */
export function dealerSection(cards: string, value: string): string {
  return `**DEALER**\n${cards}\n${value}`;
}

/** Player section */
export function playerSection(cards: string, value: string): string {
  return `**YOU**\n${cards}\n${value}`;
}

// ---------------------------------------------------------------------------
// Embed Builders — Premium Casino Style
// ---------------------------------------------------------------------------

/**
 * Base casino embed with consistent branding
 */
export function baseEmbed(
  color: number,
  balance?: string,
  guild?: Guild | null
): EmbedBuilder {
  const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
  const hasBalance = balance && balance !== '—';
  
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({
      text: hasBalance 
        ? `${ICON.coin} ${balance}  ·  ${BRAND.name}` 
        : `${BRAND.name}  ·  ${BRAND.tagline}`,
      iconURL,
    });
}

/**
 * Premium branded embed with author line
 */
export function brandedEmbed(
  color: number,
  balance?: string,
  guild?: Guild | null
): EmbedBuilder {
  const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
  const hasBalance = balance && balance !== '—';
  
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ 
      name: `${BRAND.logo}  ${BRAND.name}`, 
      iconURL 
    })
    .setTimestamp()
    .setFooter({
      text: hasBalance 
        ? `Balance: ${ICON.coin} ${balance}` 
        : BRAND.tagline,
    });
}

/**
 * Casino game embed with table styling
 */
export function gameEmbed(
  title: string,
  color: number,
  guild?: Guild | null
): EmbedBuilder {
  const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
  
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ 
      name: `${BRAND.icon}  ${BRAND.name}`, 
      iconURL 
    })
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: BRAND.tagline });
}

/**
 * Result embed with prominent status
 */
export function resultEmbed(
  result: 'win' | 'loss' | 'push' | 'jackpot' | 'bust' | 'surrender',
  payout: string,
  balance: string,
  guild?: Guild | null
): EmbedBuilder {
  const colors: Record<string, number> = {
    win: COLOR.WIN,
    loss: COLOR.LOSS,
    push: COLOR.NEUTRAL,
    jackpot: COLOR.JACKPOT,
    bust: COLOR.LOSS,
    surrender: COLOR.MUTED,
  };
  const titles: Record<string, string> = {
    win: 'YOU WIN',
    loss: 'DEALER WINS',
    push: 'PUSH',
    jackpot: 'BLACKJACK!',
    bust: 'BUST',
    surrender: 'SURRENDERED',
  };
  
  return gameEmbed(titles[result], colors[result], guild)
    .setDescription(resultBanner(result))
    .addFields(
      { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${payout}`), inline: true },
      { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${balance}`), inline: true }
    );
}

// ---------------------------------------------------------------------------
// Reply Helpers
// ---------------------------------------------------------------------------

/** Reply ephemerally with an embed */
export async function ephemeralEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  embed: EmbedBuilder
): Promise<void> {
  try {
    if (interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else if (interaction.replied) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (err) {
    console.error('[v0] ephemeralEmbed error:', err);
  }
}

/** Reply publicly with an embed */
export async function publicEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  embed: EmbedBuilder
): Promise<void> {
  try {
    if (interaction.deferred) {
      await interaction.followUp({ embeds: [embed] });
    } else if (interaction.replied) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[v0] publicEmbed error:', err);
  }
}

/** Quick ephemeral text reply */
export async function ephemeralReply(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  content: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// Button Components — Casino Style
// ---------------------------------------------------------------------------

export type SlashCommandData = SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

/** Premium action button */
export function actionButton(
  customId: string,
  label: string,
  style: ButtonStyle,
  disabled = false
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

/** Confirmation button row */
export function buildConfirmRow(customIdPrefix: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:confirm`)
      .setLabel('CONFIRM')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:cancel`)
      .setLabel('CANCEL')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ---------------------------------------------------------------------------
// Confirmation Flows
// ---------------------------------------------------------------------------

export async function waitForConfirmation(
  interaction: ChatInputCommandInteraction,
  customIdPrefix: string,
  warningMessage: string
): Promise<boolean> {
  const row = buildConfirmRow(customIdPrefix);
  await interaction.reply({
    content: warningMessage,
    components: [row],
    ephemeral: true,
  });

  return waitForButtonConfirmation(interaction, customIdPrefix);
}

export async function waitForFollowUpConfirmation(
  interaction: ChatInputCommandInteraction,
  customIdPrefix: string,
  warningMessage: string
): Promise<boolean> {
  const row = buildConfirmRow(customIdPrefix);
  const followUpMessage = await interaction.followUp({
    content: warningMessage,
    components: [row],
    ephemeral: true,
  });

  try {
    const confirmation = await followUpMessage.awaitMessageComponent({
      filter: (i: MessageComponentInteraction) =>
        i.user.id === interaction.user.id &&
        (i.customId === `${customIdPrefix}:confirm` || i.customId === `${customIdPrefix}:cancel`),
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
    });

    const confirmed = confirmation.customId === `${customIdPrefix}:confirm`;
    await confirmation.update({
      content: confirmed ? '`Processing...`' : '`Cancelled.`',
      components: [],
    });
    return confirmed;
  } catch {
    await followUpMessage.edit({ content: '`Confirmation timed out.`', components: [] }).catch(() => {});
    return false;
  }
}

async function waitForButtonConfirmation(
  interaction: ChatInputCommandInteraction,
  customIdPrefix: string
): Promise<boolean> {
  const message = await interaction.fetchReply();
  try {
    const confirmation = await message.awaitMessageComponent({
      filter: (i: MessageComponentInteraction) =>
        i.user.id === interaction.user.id &&
        (i.customId === `${customIdPrefix}:confirm` || i.customId === `${customIdPrefix}:cancel`),
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
    });

    const confirmed = confirmation.customId === `${customIdPrefix}:confirm`;
    await confirmation.update({
      content: confirmed ? '`Processing...`' : '`Cancelled.`',
      components: [],
    });
    return confirmed;
  } catch {
    await interaction.editReply({ content: '`Confirmation timed out.`', components: [] }).catch(() => {});
    return false;
  }
}

// ---------------------------------------------------------------------------
// Permission & Role Helpers
// ---------------------------------------------------------------------------

export function hasAdminRole(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.admin);
}

export function hasStaffRole(member: GuildMember): boolean {
  return (
    hasAdminRole(member) ||
    (config.roles.staff !== '0' && member.roles.cache.has(config.roles.staff))
  );
}

// ---------------------------------------------------------------------------
// Cooldown System
// ---------------------------------------------------------------------------

const cooldowns = new Map<string, number>();

export function checkCooldown(userId: string, key: string, cooldownMs: number): number | null {
  const mapKey = `${userId}:${key}`;
  const now = Date.now();
  const expires = cooldowns.get(mapKey);
  if (expires && expires > now) {
    return Math.ceil((expires - now) / 1000);
  }
  cooldowns.set(mapKey, now + cooldownMs);
  return null;
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isButtonInteraction(interaction: unknown): interaction is ButtonInteraction {
  return interaction instanceof Object && 'isButton' in (interaction as ButtonInteraction) && (interaction as ButtonInteraction).isButton();
}

export function memberFromInteraction(interaction: ChatInputCommandInteraction): GuildMember | null {
  if (!interaction.inGuild() || !interaction.member) return null;
  return interaction.member as GuildMember;
}
