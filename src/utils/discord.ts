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
  MessageFlags,
  ModalSubmitInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config';
import { CONFIRM_TIMEOUT_MS } from './constants';

export const BRAND = {
  name: 'GUHD RIDES',
  currency: 'Route Cash',
  ticker: 'RC',
  tagline: 'Premium Casino',
  logo: '◈',
  icon: '🎰',
} as const;

export const COLOR = {
  BRAND: 0x1a1a2e,
  ACCENT: 0x16213e,
  WIN: 0x00d26a,
  LOSS: 0xff4757,
  JACKPOT: 0xffd700,
  EPIC: 0xe056fd,
  RARE: 0x9b59b6,
  ACTIVE: 0x4a90d9,
  ELECTRIC: 0x00d4ff,
  INFO: 0x5865f2,
  NEUTRAL: 0x2f3136,
  WHITE: 0xffffff,
  MUTED: 0x747f8d,
} as const;

export const LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
export const THIN_LINE = '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─';
export const SPACER = '\u200b';

export const SUITS = {
  H: { icon: '♥', color: 'red', name: 'Hearts' },
  D: { icon: '♦', color: 'red', name: 'Diamonds' },
  C: { icon: '♣', color: 'black', name: 'Clubs' },
  S: { icon: '♠', color: 'black', name: 'Spades' },
} as const;

export const ICON = {
  coin: '◈',
  coins: '💰',
  wallet: '👛',
  bank: '🏦',
  cards: '🃏',
  dice: '🎲',
  slot: '🎰',
  chip: '🪙',
  win: '✦',
  loss: '✕',
  push: '≈',
  jackpot: '★',
  streak: '🔥',
  hit: '↓',
  stand: '■',
  double: '⬆',
  split: '⟷',
  fold: '↩',
  up: '▲',
  down: '▼',
  common: '○',
  uncommon: '◐',
  rare: '●',
  epic: '◆',
  legendary: '★',
  time: '⏱',
  check: '✓',
  cross: '✕',
  arrow: '→',
} as const;

export function progressBar(current: number, max: number, size = 10): string {
  const pct = Math.min(1, Math.max(0, current / max));
  const filled = Math.round(pct * size);
  return `\`[${'█'.repeat(filled)}${'░'.repeat(size - filled)}]\` ${Math.round(pct * 100)}%`;
}

export function meter(value: number, max: number): string {
  return progressBar(value, max, 8);
}

export function streakBar(streak: number, max: number): string {
  return `${ICON.streak} ${progressBar(streak, max, max)}`;
}

export function rcDisplay(amount: string): string {
  return `${ICON.coin} **${amount}** ${BRAND.ticker}`;
}

export function heroAmount(amount: string): string {
  return `# ${ICON.coin} ${amount}\n${BRAND.ticker}`;
}

export function inlineRC(amount: string): string {
  return `\`${amount} ${BRAND.ticker}\``;
}

export function netLabel(net: string, positive: boolean): string {
  return positive ? `\`+ ${net}\` ${ICON.up}` : `\`- ${net}\` ${ICON.down}`;
}

export function heroNet(net: string, positive: boolean): string {
  return positive ? `# +${net}` : `# -${net}`;
}

export function statBlock(label: string, value: string): string {
  return `**${label}**\n${value}`;
}

export function inlineStat(label: string, value: string): string {
  return `**${label}:** ${value}`;
}

export function kvRow(key: string, value: string): string {
  return `> **${key}** ${ICON.arrow} ${value}`;
}

export function statusBanner(
  text: string,
  style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' = 'info'
): string {
  const colorCode: Record<string, string> = {
    win: '32',
    loss: '31',
    jackpot: '33',
    info: '36',
    neutral: '37',
  };
  return `\`\`\`ansi\n\u001b[1;${colorCode[style]}m${text}\u001b[0m\n\`\`\``;
}

export function resultBanner(
  result: 'win' | 'loss' | 'push' | 'jackpot' | 'bust' | 'surrender'
): string {
  const banners: Record<string, { text: string; style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' }> = {
    win: { text: '✦  WINNER  ✦', style: 'win' },
    loss: { text: '✕  DEALER WINS  ✕', style: 'loss' },
    push: { text: '≈  PUSH  ≈', style: 'neutral' },
    jackpot: { text: '★  BLACKJACK  ★', style: 'jackpot' },
    bust: { text: '✕  BUST  ✕', style: 'loss' },
    surrender: { text: '↩  SURRENDERED  ↩', style: 'neutral' },
  };
  const { text, style } = banners[result] ?? banners.loss;
  return statusBanner(text, style);
}

export function cardDisplay(rank: string, suit: string): string {
  const suitData = SUITS[suit as keyof typeof SUITS] ?? { icon: suit, color: 'black' };
  return `\`[ ${rank}${suitData.icon} ]\``;
}

export function hiddenCard(): string {
  return '`[ ?? ]`';
}

export function handDisplay(
  cards: Array<{ rank: string; suit: string }>,
  hideIndex?: number
): string {
  return cards
    .map((card, i) => (i === hideIndex ? hiddenCard() : cardDisplay(card.rank, card.suit)))
    .join('  ');
}

export function handValue(value: number, revealed: boolean): string {
  if (!revealed) return '`Value: ??`';
  if (value === 21) return '**21** `BLACKJACK`';
  if (value > 21) return `**${value}** \`BUST\``;
  return `**${value}**`;
}

export function tableHeader(title: string): string {
  return `## ${ICON.cards} ${title}\n${LINE}`;
}

export function dealerSection(cards: string, value: string): string {
  return `**DEALER**\n${cards}\n${value}`;
}

export function playerSection(cards: string, value: string): string {
  return `**YOU**\n${cards}\n${value}`;
}

export function baseEmbed(color: number, balance?: string, guild?: Guild | null): EmbedBuilder {
  const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${BRAND.logo}  ${BRAND.name}`, iconURL })
    .setFooter({ text: `${BRAND.tagline}  ·  ${BRAND.name}` })
    .setTimestamp();
  if (balance && balance !== '—') {
    embed.setDescription(`${ICON.coin} **${balance}** ${BRAND.ticker}`);
  }
  return embed;
}

export function brandedEmbed(color: number, balance?: string, guild?: Guild | null): EmbedBuilder {
  return baseEmbed(color, balance, guild);
}

export function gameEmbed(title: string, color: number, guild?: Guild | null): EmbedBuilder {
  return baseEmbed(color, undefined, guild).setTitle(title);
}

export function resultEmbed(
  result: string,
  payout: string,
  balance: string,
  guild?: Guild | null
): EmbedBuilder {
  const isWin = result.toLowerCase().includes('win');
  return brandedEmbed(isWin ? COLOR.WIN : COLOR.LOSS, balance, guild)
    .setTitle(result)
    .setDescription(`${statBlock('Payout', payout)}\n${statBlock('Balance', balance)}`);
}

export async function ephemeralEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
  embed: EmbedBuilder
): Promise<void> {
  try {
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else if (interaction.replied) {
      await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error('[v0] ephemeralEmbed error:', err);
  }
}

export async function publicEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
  embed: EmbedBuilder
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[v0] publicEmbed error:', err);
  }
}

export async function ephemeralReply(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
  content: string
): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content });
  } else if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

export type SlashCommandData =
  | SlashCommandBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export function actionButton(
  customId: string,
  label: string,
  style: ButtonStyle,
  disabled = false
): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

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

export async function waitForConfirmation(
  interaction: ChatInputCommandInteraction,
  customIdPrefix: string,
  warningMessage: string
): Promise<boolean> {
  const row = buildConfirmRow(customIdPrefix);
  await interaction.reply({ content: warningMessage, components: [row], flags: MessageFlags.Ephemeral });
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
    flags: MessageFlags.Ephemeral,
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

/**
 * Restricts casino games to the configured casino channel. Returns true if the
 * command may proceed. When CASINO_CHANNEL_ID is unset ('0'), games work
 * anywhere (no breakage).
 */
export async function enforceCasinoChannel(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const casino = config.channels.casino;
  if (casino && casino !== '0' && interaction.channelId !== casino) {
    await ephemeralReply(
      interaction,
      `${ICON.cross} Casino games can only be played in <#${casino}>.`
    );
    return false;
  }
  return true;
}

export function hasAdminRole(member: GuildMember): boolean {
  return config.roles.admin !== '0' && member.roles.cache.has(config.roles.admin);
}

export function hasStaffRole(member: GuildMember): boolean {
  return (
    hasAdminRole(member) ||
    (config.roles.staff !== '0' && member.roles.cache.has(config.roles.staff))
  );
}

export function hasProviderRole(member: GuildMember): boolean {
  return (
    hasAdminRole(member) ||
    (config.roles.provider !== '0' && member.roles.cache.has(config.roles.provider))
  );
}

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

export function isButtonInteraction(interaction: unknown): interaction is ButtonInteraction {
  return (
    interaction instanceof Object &&
    'isButton' in (interaction as ButtonInteraction) &&
    (interaction as ButtonInteraction).isButton()
  );
}

export function memberFromInteraction(interaction: ChatInputCommandInteraction): GuildMember | null {
  if (!interaction.inGuild() || !interaction.member) return null;
  return interaction.member as GuildMember;
}
