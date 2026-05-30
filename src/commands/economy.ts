import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import {
  ephemeralReply,
  checkCooldown,
  baseEmbed,
  ephemeralEmbed,
  COLOR,
  progressBar,
  DIVIDER,
} from '../utils/discord';
import { config } from '../config';
import {
  LEADERBOARD_DEFAULT_LIMIT,
  TRANSACTIONS_DEFAULT_LIMIT,
  TRANSACTIONS_MAX_LIMIT,
} from '../utils/constants';

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

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

export const tipData = new SlashCommandBuilder()
  .setName('tip')
  .setDescription('Tip Route Cash to another user (public)')
  .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
  .addStringOption((o) => o.setName('amount').setDescription('Amount of RC').setRequired(true));

export const dailyData = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily Route Cash reward');

export const statsData = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View your Route Cash stats and activity')
  .addUserOption((o) =>
    o.setName('user').setDescription('View another user stats (optional)').setRequired(false)
  );

export const rankData = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('View your leaderboard rank')
  .addUserOption((o) =>
    o.setName('user').setDescription('View another user rank (optional)').setRequired(false)
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

export const inventoryData = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your crate rewards and items');

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  const embed = baseEmbed(COLOR.PRIMARY, formatRC(balance), interaction.guild)
    .setTitle('◈  Route Cash Wallet')
    .setDescription(
      `**${target.username}**'s vault\n${DIVIDER}\n## ${formatRC(balance)}`
    )
    .setThumbnail(target.displayAvatarURL());
  await ephemeralEmbed(interaction, embed);
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
    const newBalance = await services.economy.getBalance(interaction.user.id);
    const embed = baseEmbed(COLOR.WIN, formatRC(newBalance), interaction.guild)
      .setTitle('✦  Transfer Complete')
      .setDescription(`You sent **${formatRC(amount)}** to <@${recipient.id}>\n${DIVIDER}`)
      .addFields(
        { name: '↘ Recipient', value: `<@${recipient.id}>`, inline: true },
        { name: '✦ Amount', value: `**${formatRC(amount)}**`, inline: true },
        { name: '◈ New Balance', value: formatRC(newBalance), inline: true },
        { name: '✎ Reason', value: reason, inline: false }
      );
    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash for this transfer.');
      return;
    }
    throw err;
  }
}

export async function handleTip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const remaining = checkCooldown(interaction.user.id, 'tip', config.limits.commandCooldownMs);
  if (remaining) {
    await ephemeralReply(interaction, `Please wait ${remaining}s before using this again.`);
    return;
  }

  const recipient = interaction.options.getUser('user', true);
  const amountStr = interaction.options.getString('amount', true);

  if (recipient.id === interaction.user.id) {
    await ephemeralReply(interaction, 'You cannot tip yourself.');
    return;
  }

  try {
    const amount = parseAmount(amountStr);
    await services.user.ensureUser(interaction.user.id);
    await services.user.ensureUser(recipient.id);
    await services.economy.transferBalance(interaction.user.id, recipient.id, amount, 'Tip');
    const embed = baseEmbed(COLOR.WIN, formatRC(amount), interaction.guild)
      .setTitle('✦  Tip Sent!')
      .setDescription(
        `<@${interaction.user.id}> just tipped <@${recipient.id}>\n${DIVIDER}\n## +${formatRC(amount)}`
      );
    // Tips are public
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash for this tip.');
      return;
    }
    throw err;
  }
}

export async function handleDaily(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await services.user.ensureUser(interaction.user.id);
  try {
    const { amount, streak, nextClaimAt } = await services.economy.claimDaily(
      interaction.user.id,
      config.daily.reward,
      config.daily.cooldownHours,
      config.daily.streakBonus,
      config.daily.maxStreak
    );
    const newBalance = await services.economy.getBalance(interaction.user.id);
    const maxed = streak >= config.daily.maxStreak;
    const streakLabel = maxed ? `🔥 ${streak} \`MAX\`` : `🔥 ${streak}`;
    const streakBar = progressBar(streak, config.daily.maxStreak, 12);
    const embed = baseEmbed(maxed ? COLOR.JACKPOT : COLOR.WIN, formatRC(newBalance), interaction.guild)
      .setTitle('✦  Daily Reward Claimed!')
      .setDescription(`## +${formatRC(amount)}\n${DIVIDER}`)
      .addFields(
        { name: '🔥 Streak', value: streakLabel, inline: true },
        { name: '◈ Balance', value: formatRC(newBalance), inline: true },
        {
          name: `Streak Progress  (${streak}/${config.daily.maxStreak})`,
          value: `${streakBar}${maxed ? '\n**Streak maxed — top bonus active!**' : ''}`,
          inline: false,
        },
        {
          name: '⏱ Next Claim',
          value: `<t:${Math.floor(nextClaimAt.getTime() / 1000)}:R>`,
          inline: false,
        }
      );
    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    const nextClaimAt = (err as Error & { nextClaimAt?: Date }).nextClaimAt;
    if (nextClaimAt) {
      const embed = baseEmbed(COLOR.ERROR, '—', interaction.guild)
        .setTitle('⏱  Daily on Cooldown')
        .setDescription(
          `You've already claimed today.\n${DIVIDER}\nCome back <t:${Math.floor(nextClaimAt.getTime() / 1000)}:R> to keep your streak alive.`
        );
      await ephemeralEmbed(interaction, embed);
      return;
    }
    throw err;
  }
}

export async function handleStats(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  const activity = await services.user.getActivity(target.id);
  const inviteCount = await services.economy.getValidInviteCount(target.id);

  const embed = baseEmbed(COLOR.INFO, formatRC(balance), interaction.guild)
    .setTitle(`◈  ${target.username}'s Stats`)
    .setDescription(`## ${formatRC(balance)}\n${DIVIDER}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: '✉ Messages', value: `**${activity.messageCount}**`, inline: true },
      { name: '🎙 VC Minutes', value: `**${activity.vcMinutes}**`, inline: true },
      { name: '➤ Valid Invites', value: `**${inviteCount}**`, inline: true }
    );
  await ephemeralEmbed(interaction, embed);
}

export async function handleRank(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const { rank, total } = await services.economy.getUserRank(target.id);
  const balance = await services.economy.getBalance(target.id);

  // Higher position = fuller bar (rank #1 fills the meter)
  const rankBar = progressBar(Math.max(0, total - rank + 1), Math.max(1, total), 12);
  const topPct = total > 0 ? Math.max(1, Math.round((rank / total) * 100)) : 100;
  const embed = baseEmbed(rank <= 3 ? COLOR.JACKPOT : COLOR.PRIMARY, formatRC(balance), interaction.guild)
    .setTitle('▲  Leaderboard Rank')
    .setDescription(
      `**${target.username}**\n${DIVIDER}\n## #${rank} \`/ ${total}\`\nTop **${topPct}%** of all holders`
    )
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: 'Standing', value: rankBar, inline: false },
      { name: '◈ Balance', value: formatRC(balance), inline: true }
    );
  await ephemeralEmbed(interaction, embed);
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
  const balance = await services.economy.getBalance(interaction.user.id);
  const lines = txs.map((t) => {
    const credit = !String(t.amount).trim().startsWith('-');
    const arrow = credit ? '🟢 ▲' : '🔴 ▼';
    return `${arrow} \`${t.timestamp.toISOString().slice(0, 10)}\` **${t.type}**  ${t.amount} RC  →  ${t.balance_after} RC\n┕ *${t.reason}*`;
  });
  const embed = baseEmbed(COLOR.INFO, formatRC(balance), interaction.guild)
    .setTitle('☰  Recent Transactions')
    .setDescription(`${DIVIDER}\n${lines.join('\n').slice(0, 3900)}`);
  await ephemeralEmbed(interaction, embed);
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
  const topBalance = Number(rows[0]?.balance ?? 0) || 1;
  const lines = await Promise.all(
    rows.map(async (r, i) => {
      const user = await interaction.client.users.fetch(r.user_id).catch(() => null);
      const name = user?.username ?? r.user_id;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`#${i + 1}\``;
      const bar = progressBar(Number(r.balance), topBalance, 8);
      return `${medal}  **${name}**\n┕ ${bar}  **${r.balance} RC**`;
    })
  );
  const balance = await services.economy.getBalance(interaction.user.id);
  const embed = baseEmbed(COLOR.JACKPOT, formatRC(balance), interaction.guild)
    .setTitle('♔  Route Cash Leaderboard')
    .setDescription(`Top ${rows.length} richest riders\n${DIVIDER}\n${lines.join('\n').slice(0, 3800)}`);
  await ephemeralEmbed(interaction, embed);
}

export async function handleInventory(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await services.user.ensureUser(interaction.user.id);
  const items = await services.user.getInventory(interaction.user.id);
  const balance = await services.economy.getBalance(interaction.user.id);
  if (items.length === 0) {
    const embed = baseEmbed(COLOR.INFO, formatRC(balance), interaction.guild)
      .setTitle('🎒  Inventory')
      .setDescription(`${DIVIDER}\nYour stash is empty. Open a crate with \`/crate\` to start collecting loot.`);
    await ephemeralEmbed(interaction, embed);
    return;
  }
  const lines = items.map((item) => {
    const meta = item.item_metadata ? ` \`${JSON.stringify(item.item_metadata)}\`` : '';
    return `◈  **${item.item_type.replace(/_/g, ' ')}**  ×${item.quantity}${meta}`;
  });
  const embed = baseEmbed(COLOR.RARE, formatRC(balance), interaction.guild)
    .setTitle('🎒  Your Inventory')
    .setDescription(`${DIVIDER}\n${lines.join('\n').slice(0, 3900)}`);
  await ephemeralEmbed(interaction, embed);
}
