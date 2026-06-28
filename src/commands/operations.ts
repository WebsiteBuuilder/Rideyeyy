import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { ephemeralReply, hasStaffRole, memberFromInteraction } from '../utils/discord';

export const openData = new SlashCommandBuilder()
  .setName('open')
  .setDescription('Open bookings and show the green category (staff only)');

export const closeData = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Close bookings and show the red category (staff only)');

async function requireStaff(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild()) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return false;
  }
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'You must be staff to use this command.');
    return false;
  }
  return true;
}

export async function handleOpen(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!(await requireStaff(interaction))) return;
  await interaction.deferReply({ flags: 64 });
  await services.operations.setBookingsOpen(interaction.guild!, true);
  await interaction.editReply('Bookings are now **OPEN**. New `/book` and Book Now orders are accepted.');
}

export async function handleClose(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!(await requireStaff(interaction))) return;
  await interaction.deferReply({ flags: 64 });
  await services.operations.setBookingsOpen(interaction.guild!, false);
  await interaction.editReply('Bookings are now **CLOSED**. The category shows red until you `/open` again.');
}
