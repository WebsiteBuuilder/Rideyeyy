import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import { ephemeralReply, checkCooldown } from '../utils/discord';
import { config } from '../config';
import {
  LEADERBOARD_DEFAULT_LIMIT,
  TRANSACTIONS_DEFAULT_LIMIT,
  TRANSACTIONS_MAX_LIMIT,
} from '../utils/constants';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your Route Cash balance')
  .addUserOption((o) =>
    o.setName('user').setDescription('View another user balance (optional)').setRequired(false)
  );

export const payData = new SlashCommandBuilder()
  .setName('pay')
  .setDescription('Transfer Route Cash to another user')
  .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
  .addStringOption((o) => o.setName('amount').setDescription('Amount of RC').setRequired(true))
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason for transfer').setRequired(false)
  );

export const transactionsData = new SlashCommandBuilder()
  .setName('transactions')
  .setDescription('View your recent transactions')
  .addIntegerOption((o) =>
    o
      .setName('limit')
      .setDescription('Number of transactions (max 25)')
      .setMinValue(1)
      .setMaxValue(TRANSACTIONS_MAX_LIMIT)
      .setRequired(false)
  );

export const leaderboardData = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top Route Cash holders')
  .addIntegerOption((o) =>
    o.setName('limit').setDescription('Number of users').setMinValue(1).setMaxValue(25).setRequired(false)
  );

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  await ephemeralReply(
    interaction,
    `**${target.username}** has **${formatRC(balance)}**`
  );
}

export async function handlePay(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const remaining = checkCooldown(interaction.user.id, 'pay', config.limits.commandCooldownMs);
  if (remaining) {
    await ephemeralReply(interaction, `Please wait ${remaining}s before using this again.`);
    return;
  }

  const recipient = interaction.options.getUser('user', true);
  const amountStr = interaction.options.getString('amount', true);
  const reason = interaction.options.getString('reason') ?? 'P2P Transfer';

  if (recipient.id === interaction.user.id) {
    await ephemeralReply(interaction, 'You cannot pay yourself.');
    return;
  }

  try {
    const amount = parseAmount(amountStr);
    await services.user.ensureUser(interaction.user.id);
    await services.user.ensureUser(recipient.id);
    await services.economy.transferBalance(interaction.user.id, recipient.id, amount, reason);
    await ephemeralReply(
      interaction,
      `Transferred **${formatRC(amount)}** to **${recipient.username}**.`
    );
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash for this transfer.');
      return;
    }
    throw err;
  }
}

export async function handleTransactions(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? TRANSACTIONS_DEFAULT_LIMIT;
  const txs = await services.economy.getTransactions(interaction.user.id, limit);
  if (txs.length === 0) {
    await ephemeralReply(interaction, 'No transactions found.');
    return;
  }
  const lines = txs.map(
    (t) =>
      `\`${t.timestamp.toISOString().slice(0, 10)}\` **${t.type}** ${t.amount} RC → ${t.balance_after} RC — ${t.reason}`
  );
  await ephemeralReply(interaction, lines.join('\n').slice(0, 2000));
}

export async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? LEADERBOARD_DEFAULT_LIMIT;
  const rows = await services.economy.getLeaderboard(limit);
  if (rows.length === 0) {
    await ephemeralReply(interaction, 'No balances yet.');
    return;
  }
  const lines = await Promise.all(
    rows.map(async (r, i) => {
      const user = await interaction.client.users.fetch(r.user_id).catch(() => null);
      const name = user?.username ?? r.user_id;
      return `**${i + 1}.** ${name} — **${r.balance} RC**`;
    })
  );
  await ephemeralReply(interaction, `🏆 **Route Cash Leaderboard**\n${lines.join('\n')}`);
}
