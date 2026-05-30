import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { parseAmount, formatRC } from '../utils/math';
import {
  ephemeralReply,
  hasAdminRole,
  memberFromInteraction,
  waitForConfirmation,
  waitForFollowUpConfirmation,
  baseEmbed,
  ephemeralEmbed,
  COLOR,
  DIVIDER,
} from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin economy management commands')
  // ---- snapshot ----
  .addSubcommand((s) =>
    s.setName('snapshot').setDescription('Economy snapshot commands').addStringOption((o) =>
      o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'create', value: 'create' })
    )
  )
  // ---- rollback ----
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
  // ---- replay ----
  .addSubcommand((s) =>
    s
      .setName('replay')
      .setDescription('Replay transactions to rebuild balances')
      .addStringOption((o) => o.setName('start').setDescription('Start ISO timestamp').setRequired(true))
      .addStringOption((o) => o.setName('end').setDescription('End ISO timestamp').setRequired(false))
  )
  // ---- balance (set) ----
  .addSubcommand((s) =>
    s
      .setName('balance')
      .setDescription('Set, add, remove or view a user balance')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Action')
          .setRequired(true)
          .addChoices(
            { name: 'set', value: 'set' },
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
            { name: 'view', value: 'view' }
          )
      )
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption((o) =>
        o.setName('amount').setDescription('Amount (not required for view)').setRequired(false)
      )
      .addStringOption((o) =>
        o.setName('reason').setDescription('Reason (optional)').setRequired(false)
      )
  )
  // ---- send ----
  .addSubcommand((s) =>
    s
      .setName('send')
      .setDescription('Send RC to a list of user IDs (comma-separated)')
      .addStringOption((o) => o.setName('user_ids').setDescription('Comma-separated user IDs').setRequired(true))
      .addStringOption((o) => o.setName('amount').setDescription('Amount per user').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
  )
  // ---- freeze / unfreeze ----
  .addSubcommand((s) =>
    s
      .setName('freeze')
      .setDescription('Freeze a user account')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('unfreeze')
      .setDescription('Unfreeze a user account')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
  )
  // ---- redeem admin ----
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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
      await handleBalance(interaction, services);
      break;
    case 'send':
      await handleSend(interaction, services);
      break;
    case 'freeze':
      await handleFreeze(interaction, services);
      break;
    case 'unfreeze':
      await handleUnfreeze(interaction, services);
      break;
    case 'redeem':
      await handleRedeemClear(interaction, services);
      break;
    default:
      await ephemeralReply(interaction, 'Unknown subcommand.');
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSnapshot(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const id = await services.backup.takeEconomySnapshot({ triggeredBy: interaction.user.id });
  const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
    .setTitle('✓  Snapshot Created')
    .setDescription(`${DIVIDER}\nEconomy backed up\n\n\`${id}\``);
  await ephemeralEmbed(interaction, embed);
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
      `**CRITICAL**: This will overwrite **ALL** user balances with snapshot \`${snapshotId}\`. Click CONFIRM to proceed.`
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
    `Roll back user \`${userId}\` to balance at \`${timestampStr}\`?`
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
    '**Step 1/2**: Economy replay will **truncate all balances** and rebuild from transactions in the selected window. Continue?'
  );
  if (!confirmed) return;

  const finalConfirm = await waitForFollowUpConfirmation(
    interaction,
    'admin_replay_2',
    '**Step 2/2 — FINAL**: This is destructive and hard to undo. Click **CONFIRM** only if you have a recent snapshot.'
  );
  if (!finalConfirm) return;

  await services.backup.replayEconomy(start, end, interaction.user.id);
  await interaction.followUp({ content: 'Economy replay completed.', ephemeral: true });
}

async function handleBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const action = interaction.options.getString('action', true) as 'set' | 'add' | 'remove' | 'view';
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? `Admin ${action} balance`;

  if (action === 'view') {
    await services.user.ensureUser(user.id);
    const balance = await services.economy.getBalance(user.id);
    const embed = baseEmbed(COLOR.INFO, formatRC(balance), interaction.guild)
      .setTitle('◈  User Balance')
      .setDescription(`${DIVIDER}\n## ${formatRC(balance)}`)
      .addFields({ name: '👤 User', value: `<@${user.id}>`, inline: true });
    await ephemeralEmbed(interaction, embed);
    return;
  }

  const amountStr = interaction.options.getString('amount');
  if (!amountStr) {
    await ephemeralReply(interaction, 'Amount is required for this action.');
    return;
  }
  const amount = parseAmount(amountStr);

  if (action === 'set') {
    const confirmed = await waitForConfirmation(
      interaction,
      `admin_set_${user.id}`,
      `Set **${user.username}** balance to **${formatRC(amount)}**?`
    );
    if (!confirmed) return;
    await services.economy.setBalance(user.id, amount, reason, interaction.user.id);
    await interaction.followUp({ content: `Balance set to ${formatRC(amount)}.`, ephemeral: true });
    return;
  }

  if (action === 'add') {
    await services.user.ensureUser(user.id);
    await services.economy.adminAddBalance(user.id, amount, reason, interaction.user.id);
    const newBal = await services.economy.getBalance(user.id);
    const embed = baseEmbed(COLOR.WIN, formatRC(newBal), interaction.guild)
      .setTitle('▲  Balance Added')
      .setDescription(`${DIVIDER}\n+${formatRC(amount)}`)
      .addFields(
        { name: '👤 User', value: `<@${user.id}>`, inline: true },
        { name: '◈ New Balance', value: formatRC(newBal), inline: true }
      );
    await ephemeralEmbed(interaction, embed);
    return;
  }

  if (action === 'remove') {
    await services.user.ensureUser(user.id);
    try {
      await services.economy.adminRemoveBalance(user.id, amount, reason, interaction.user.id);
      const newBal = await services.economy.getBalance(user.id);
      const embed = baseEmbed(COLOR.ERROR, formatRC(newBal), interaction.guild)
        .setTitle('▼  Balance Removed')
        .setDescription(`${DIVIDER}\n-${formatRC(amount)}`)
        .addFields(
          { name: '👤 User', value: `<@${user.id}>`, inline: true },
          { name: '◈ New Balance', value: formatRC(newBal), inline: true }
        );
      await ephemeralEmbed(interaction, embed);
    } catch (err) {
      await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to remove balance.');
    }
  }
}

async function handleSend(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const rawIds = interaction.options.getString('user_ids', true);
  const amountStr = interaction.options.getString('amount', true);
  const reason = interaction.options.getString('reason') ?? 'Admin Send';
  const amount = parseAmount(amountStr);

  const userIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
  if (userIds.length === 0) {
    await ephemeralReply(interaction, 'No valid user IDs provided.');
    return;
  }
  if (userIds.length > 50) {
    await ephemeralReply(interaction, 'Maximum 50 users per send command.');
    return;
  }

  const confirmed = await waitForConfirmation(
    interaction,
    `admin_send_${Date.now()}`,
    `Send **${formatRC(amount)}** to **${userIds.length}** users? Total: **${formatRC(amount.mul(userIds.length))}**`
  );
  if (!confirmed) return;

  let succeeded = 0;
  let failed = 0;
  for (const uid of userIds) {
    try {
      await services.user.ensureUser(uid);
      await services.economy.adminAddBalance(uid, amount, reason, interaction.user.id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
    .setTitle('✓  Bulk Send Complete')
    .setDescription(`${DIVIDER}\n${formatRC(amount)} to ${succeeded} users`)
    .addFields(
      { name: '✦ Per User', value: formatRC(amount), inline: true },
      { name: '✓ Succeeded', value: String(succeeded), inline: true },
      { name: '✕ Failed', value: String(failed), inline: true }
    );
  await ephemeralEmbed(interaction, embed);
}

async function handleFreeze(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  await services.economy.freezeUser(user.id, interaction.user.id, reason);

  const embed = baseEmbed(COLOR.ERROR, '—', interaction.guild)
    .setTitle('🔒  Account Frozen')
    .setDescription(`${DIVIDER}\n${reason}`)
    .addFields({ name: '👤 User', value: `<@${user.id}>`, inline: true });
  await ephemeralEmbed(interaction, embed);
}

async function handleUnfreeze(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const user = interaction.options.getUser('user', true);
  await services.economy.unfreezeUser(user.id, interaction.user.id);

  const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
    .setTitle('🔓  Account Unfrozen')
    .setDescription(`${DIVIDER}\n<@${user.id}>'s account is now active.`);
  await ephemeralEmbed(interaction, embed);
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
  const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
    .setTitle('✓  Redemption Cleared')
    .setDescription(`${DIVIDER}\nPending redemption cleared for <@${user.id}>.`);
  await ephemeralEmbed(interaction, embed);
}
