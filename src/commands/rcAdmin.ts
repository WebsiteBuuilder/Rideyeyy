import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import Decimal from 'decimal.js';
import type { AppServices } from '../types';
import { adjustBalanceTx, InsufficientFundsError } from '../lib/wallet';
import { BRAND, COLOR, ICON, ephemeralReply, hasStaffRole } from '../utils/discord';
import { EmbedBuilder } from 'discord.js';

// ═══════════════════════════════════════════════════════════════════════════
//  /rc give · /rc take — staff Route Cash adjustments (separate from invites)
// ═══════════════════════════════════════════════════════════════════════════

export const rcData = new SlashCommandBuilder()
  .setName('rc')
  .setDescription('Staff Route Cash management')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('give')
      .setDescription('Grant Route Cash to a member')
      .addUserOption((o) => o.setName('user').setDescription('Member to credit').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('Amount of RC to grant').setRequired(true).setMinValue(1)
      )
      .addStringOption((o) => o.setName('reason').setDescription('Optional note for the audit log'))
  )
  .addSubcommand((sub) =>
    sub
      .setName('take')
      .setDescription('Remove Route Cash from a member')
      .addUserOption((o) => o.setName('user').setDescription('Member to debit').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('Amount of RC to remove').setRequired(true).setMinValue(1)
      )
      .addStringOption((o) => o.setName('reason').setDescription('Optional note for the audit log'))
  );

export async function handleRc(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }

  const member = interaction.member as GuildMember | null;
  const isStaff = member != null && hasStaffRole(member);
  const isDiscordAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (!isStaff && !isDiscordAdmin) {
    await ephemeralReply(interaction, 'Only staff or administrators can adjust Route Cash balances.');
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason')?.trim();
  const staffTag = interaction.user.tag;

  await interaction.deferReply({ flags: 64 });

  try {
    if (sub === 'give') {
      const detail = reason ?? `Granted by ${staffTag}`;
      await adjustBalanceTx(target.id, new Decimal(amount), 'admin_grant', detail);
      await services.invite.logging.log({
        guildId,
        event: 'RC_GRANT',
        actorId: interaction.user.id,
        targetUserId: target.id,
        detail: `+${amount} ${BRAND.ticker}${reason ? ` — ${reason}` : ''}`,
      });
      const embed = new EmbedBuilder()
        .setColor(COLOR.WIN)
        .setTitle(`${ICON.check} Route Cash granted`)
        .setDescription(
          `Credited **${amount}** ${BRAND.ticker} to <@${target.id}>.\n${reason ? `_Reason: ${reason}_` : ''}`
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const detail = reason ?? `Deducted by ${staffTag}`;
    await adjustBalanceTx(target.id, new Decimal(-amount), 'admin_deduct', detail);
    await services.invite.logging.log({
      guildId,
      event: 'RC_DEDUCT',
      actorId: interaction.user.id,
      targetUserId: target.id,
      detail: `-${amount} ${BRAND.ticker}${reason ? ` — ${reason}` : ''}`,
    });
    const embed = new EmbedBuilder()
      .setColor(COLOR.INFO)
      .setTitle(`${ICON.arrow} Route Cash removed`)
      .setDescription(
        `Debited **${amount}** ${BRAND.ticker} from <@${target.id}>.\n${reason ? `_Reason: ${reason}_` : ''}`
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.editReply({ content: `<@${target.id}> does not have enough ${BRAND.ticker} for that deduction.` });
      return;
    }
    console.error('[RC] adjustment failed:', err);
    await interaction.editReply({ content: 'Failed to adjust balance. Please try again.' });
  }
}
