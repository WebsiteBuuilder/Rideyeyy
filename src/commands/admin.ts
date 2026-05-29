import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { parseAmount, formatRC } from '../utils/math';
import {
  ephemeralReply,
  hasAdminRole,
  memberFromInteraction,
  waitForConfirmation,
  waitForFollowUpConfirmation,
} from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin economy management commands')
  .addSubcommand((s) =>
    s.setName('snapshot').setDescription('Economy snapshot commands').addStringOption((o) =>
      o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'create', value: 'create' })
    )
  )
  .addSubcommand((s) =>
    s
      .setName('rollback')
      .setDescription('Rollback economy or user')
      .addStringOption((o) =>
        o
          .setName('type')
          .setDescription('Rollback type')
          .setRequired(true)
          .addChoices(
            { name: 'economy', value: 'economy' },
            { name: 'user', value: 'user' }
          )
      )
      .addStringOption((o) => o.setName('snapshot_id').setDescription('Snapshot UUID (economy)').setRequired(false))
      .addStringOption((o) => o.setName('user_id').setDescription('User ID (user rollback)').setRequired(false))
      .addStringOption((o) =>
        o.setName('timestamp').setDescription('ISO timestamp (user rollback)').setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('replay')
      .setDescription('Replay transactions to rebuild balances')
      .addStringOption((o) => o.setName('start').setDescription('Start ISO timestamp').setRequired(true))
      .addStringOption((o) => o.setName('end').setDescription('End ISO timestamp').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('balance')
      .setDescription('Set user balance')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption((o) => o.setName('amount').setDescription('New balance').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('redeem')
      .setDescription('Redeem admin commands')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Action')
          .setRequired(true)
          .addChoices({ name: 'clear', value: 'clear' })
      )
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || !hasAdminRole(member)) {
    await ephemeralReply(interaction, 'You do not have permission to use admin commands.');
    return;
  }

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'snapshot':
      await handleSnapshot(interaction, services);
      break;
    case 'rollback':
      await handleRollback(interaction, services);
      break;
    case 'replay':
      await handleReplay(interaction, services);
      break;
    case 'balance':
      await handleSetBalance(interaction, services);
      break;
    case 'redeem':
      await handleRedeemClear(interaction, services);
      break;
    default:
      await ephemeralReply(interaction, 'Unknown subcommand.');
  }
}

async function handleSnapshot(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const id = await services.backup.takeEconomySnapshot({ triggeredBy: interaction.user.id });
  await ephemeralReply(interaction, `Economy snapshot created: \`${id}\``);
}

async function handleRollback(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const type = interaction.options.getString('type', true);

  if (type === 'economy') {
    const snapshotId = interaction.options.getString('snapshot_id', true);
    const confirmed = await waitForConfirmation(
      interaction,
      `admin_rb_econ_${snapshotId}`,
      `⚠️ **CRITICAL**: This will overwrite **ALL** user balances with snapshot \`${snapshotId}\`. Click CONFIRM to proceed.`
    );
    if (!confirmed) return;
    await services.backup.rollbackEconomy(snapshotId, interaction.user.id);
    await interaction.followUp({ content: 'Economy rollback completed.', ephemeral: true });
    return;
  }

  const userId = interaction.options.getString('user_id', true);
  const timestampStr = interaction.options.getString('timestamp', true);
  const timestamp = new Date(timestampStr);
  if (isNaN(timestamp.getTime())) {
    await ephemeralReply(interaction, 'Invalid timestamp.');
    return;
  }

  const confirmed = await waitForConfirmation(
    interaction,
    `admin_rb_user_${userId}`,
    `⚠️ Roll back user \`${userId}\` to balance at \`${timestampStr}\`?`
  );
  if (!confirmed) return;
  await services.backup.rollbackUser(userId, timestamp, interaction.user.id);
  await interaction.followUp({ content: 'User rollback completed.', ephemeral: true });
}

async function handleReplay(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const start = new Date(interaction.options.getString('start', true));
  const endStr = interaction.options.getString('end');
  const end = endStr ? new Date(endStr) : null;

  const confirmed = await waitForConfirmation(
    interaction,
    'admin_replay_1',
    '⚠️ **Step 1/2**: Economy replay will **truncate all balances** and rebuild from transactions in the selected window. Continue?'
  );
  if (!confirmed) return;

  const finalConfirm = await waitForFollowUpConfirmation(
    interaction,
    'admin_replay_2',
    '⚠️ **Step 2/2 — FINAL**: This is destructive and hard to undo. Click **CONFIRM** only if you have a recent snapshot.'
  );
  if (!finalConfirm) return;

  await services.backup.replayEconomy(start, end, interaction.user.id);
  await interaction.followUp({ content: 'Economy replay completed.', ephemeral: true });
}

async function handleSetBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const amount = parseAmount(interaction.options.getString('amount', true));

  const confirmed = await waitForConfirmation(
    interaction,
    `admin_set_${user.id}`,
    `Set **${user.username}** balance to **${formatRC(amount)}**?`
  );
  if (!confirmed) return;

  await services.economy.setBalance(user.id, amount, 'Admin balance set', interaction.user.id);
  await interaction.followUp({ content: `Balance set to ${formatRC(amount)}.`, ephemeral: true });
}

async function handleRedeemClear(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const action = interaction.options.getString('action', true);
  if (action !== 'clear') return;

  const user = interaction.options.getUser('user', true);
  await services.redeem.clearPendingRedemption(
    interaction.client,
    interaction.guildId!,
    user.id,
    interaction.user.id
  );
  await ephemeralReply(interaction, `Cleared pending redemption for ${user.username}.`);
}
