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

// ---------------------------------------------------------------------------
// Embed color palette (matches spec)
// ---------------------------------------------------------------------------
export const COLOR = {
  PRIMARY: 0x00e5a0,   // mint — neutral/info
  ERROR: 0xef4444,     // red — errors
  WIN: 0x10b981,       // green — wins/success
  JACKPOT: 0xf59e0b,   // gold — milestone/jackpot
  RARE: 0x7c3aed,      // purple — rare/premium
} as const;

/** Build a base embed pre-populated with footer (RC balance + Guhd Rides label), timestamp, and color. */
export function baseEmbed(
  color: number,
  balance: string,
  guild?: Guild | null
): EmbedBuilder {
  const iconURL = guild?.iconURL() ?? undefined;
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `RC Balance: ${balance} RC  •  Guhd Rides`, iconURL });
}

/** Reply ephemerally with a pre-built embed. */
export async function ephemeralEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  embed: EmbedBuilder
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

/** Reply publicly with a pre-built embed. */
export async function publicEmbed(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  embed: EmbedBuilder
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

export type SlashCommandData = SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export function hasAdminRole(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.admin);
}

export function hasStaffRole(member: GuildMember): boolean {
  return (
    hasAdminRole(member) ||
    (config.roles.staff !== '0' && member.roles.cache.has(config.roles.staff))
  );
}

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

export function buildConfirmRow(customIdPrefix: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:confirm`)
      .setLabel('CONFIRM')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
}

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
      content: confirmed ? 'Confirmed. Processing...' : 'Cancelled.',
      components: [],
    });
    return confirmed;
  } catch {
    await followUpMessage.edit({ content: 'Confirmation timed out.', components: [] }).catch(() => {});
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
      content: confirmed ? 'Confirmed. Processing...' : 'Cancelled.',
      components: [],
    });
    return confirmed;
  } catch {
    await interaction.editReply({ content: 'Confirmation timed out.', components: [] }).catch(() => {});
    return false;
  }
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
  return interaction instanceof Object && 'isButton' in (interaction as ButtonInteraction) && (interaction as ButtonInteraction).isButton();
}

export function memberFromInteraction(interaction: ChatInputCommandInteraction): GuildMember | null {
  if (!interaction.inGuild() || !interaction.member) return null;
  return interaction.member as GuildMember;
}


