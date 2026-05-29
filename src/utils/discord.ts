import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Collection,
  ComponentType,
  GuildMember,
  MessageComponentInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config';
import { CONFIRM_TIMEOUT_MS } from './constants';

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

export function collectCommandBuilders(
  modules: Array<{ data: SlashCommandData }>
): SlashCommandData[] {
  return modules.map((m) => m.data);
}
