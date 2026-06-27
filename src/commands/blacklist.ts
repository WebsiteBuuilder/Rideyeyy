import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { ephemeralReply, hasStaffRole, memberFromInteraction } from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Manage booking blacklist (staff only)')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a user to the booking blacklist')
      .addUserOption((o) => o.setName('user').setDescription('User to blacklist').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove a user from the booking blacklist')
      .addUserOption((o) => o.setName('user').setDescription('User to unblacklist').setRequired(true))
  );

export async function handleBlacklist(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'Only staff can manage the blacklist.');
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user', true);

  if (sub === 'add') {
    const reason = interaction.options.getString('reason') ?? undefined;
    await services.blacklist.add(target.id, interaction.user.id, reason);
    await ephemeralReply(interaction, `<@${target.id}> has been added to the booking blacklist.`);
    return;
  }

  const removed = await services.blacklist.remove(target.id);
  await ephemeralReply(
    interaction,
    removed
      ? `<@${target.id}> has been removed from the booking blacklist.`
      : `<@${target.id}> was not on the blacklist.`
  );
}
