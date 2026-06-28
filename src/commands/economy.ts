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
  brandedEmbed,
  ephemeralEmbed,
  COLOR,
  progressBar,
  streakBar,
  statusBanner,
  LINE,
  THIN_LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  heroAmount,
} from '../utils/discord';
import { config } from '../config';
import {
  LEADERBOARD_DEFAULT_LIMIT,
  TRANSACTIONS_DEFAULT_LIMIT,
  TRANSACTIONS_MAX_LIMIT,
} from '../utils/constants';

// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS — Premium Casino Economy System
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Command Definitions
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
  .setDescription('View your reward items and inventory');

// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  
  const embed = brandedEmbed(COLOR.ELECTRIC, formatRC(balance), interaction.guild)
    .setTitle(`${ICON.wallet} ${target.username}'s Wallet`)
    .setDescription(
      `# ${ICON.coin} ${formatRC(balance)}\n` +
      `${LINE}\n` +
      statusBanner('ROUTE CASH BALANCE', 'info')
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }));
    
  await ephemeralEmbed(interaction, embed);
}

// ---------------------------------------------------------------------------
// Pay / Transfer
// ---------------------------------------------------------------------------

export async function handlePay(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const remaining = checkCooldown(interaction.user.id, 'pay', config.limits.commandCooldownMs);
  if (remaining) {
    await ephemeralReply(interaction, `${ICON.time} Please wait ${remaining}s before using this again.`);
    return;
  }

  const recipient = interaction.options.getUser('user', true);
  const amountStr = interaction.options.getString('amount', true);
  const reason = interaction.options.getString('reason') ?? 'P2P Transfer';

  if (recipient.id === interaction.user.id) {
    await ephemeralReply(interaction, `${ICON.loss} You cannot pay yourself.`);
    return;
  }

  try {
    const amount = parseAmount(amountStr);
    await services.user.ensureUser(interaction.user.id);
    await services.user.ensureUser(recipient.id);
    await services.economy.transferBalance(interaction.user.id, recipient.id, amount, reason);
    const newBalance = await services.economy.getBalance(interaction.user.id);
    
    const embed = brandedEmbed(COLOR.WIN, formatRC(newBalance), interaction.guild)
      .setTitle(`${ICON.check} TRANSFER COMPLETE`)
      .setDescription(
        statusBanner(`${ICON.win}  SENT SUCCESSFULLY  ${ICON.win}`, 'win') +
        `\n**${ICON.coin} ${formatRC(amount)}** ${ICON.arrow} <@${recipient.id}>\n` +
        `${LINE}`
      )
      .addFields(
        { name: SPACER, value: statBlock('TO', `<@${recipient.id}>`), inline: true },
        { name: SPACER, value: statBlock('AMOUNT', `${ICON.coin} ${formatRC(amount)}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(newBalance)}`), inline: true }
      );
      
    if (reason !== 'P2P Transfer') {
      embed.addFields({ name: `${ICON.arrow} MEMO`, value: `\`\`\`${reason}\`\`\``, inline: false });
    }
    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Insufficient Route Cash for this transfer.`);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tip (Public)
// ---------------------------------------------------------------------------

export async function handleTip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const remaining = checkCooldown(interaction.user.id, 'tip', config.limits.commandCooldownMs);
  if (remaining) {
    await ephemeralReply(interaction, `${ICON.time} Please wait ${remaining}s before using this again.`);
    return;
  }

  const recipient = interaction.options.getUser('user', true);
  const amountStr = interaction.options.getString('amount', true);

  if (recipient.id === interaction.user.id) {
    await ephemeralReply(interaction, `${ICON.loss} You cannot tip yourself.`);
    return;
  }

  try {
    const amount = parseAmount(amountStr);
    await services.user.ensureUser(interaction.user.id);
    await services.user.ensureUser(recipient.id);
    await services.economy.transferBalance(interaction.user.id, recipient.id, amount, 'Tip');
    
    const embed = new EmbedBuilder()
      .setColor(COLOR.ELECTRIC)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(`${ICON.coins} TIP RECEIVED`)
      .setDescription(
        statusBanner(`${ICON.coin}  PUBLIC TIP  ${ICON.coin}`, 'info') +
        `\n<@${interaction.user.id}> tipped <@${recipient.id}>\n\n` +
        `# + ${ICON.coin} ${formatRC(amount)}\n` +
        `${LINE}`
      )
      .setThumbnail(recipient.displayAvatarURL({ size: 256 }))
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
      
    // Tips are public
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Insufficient Route Cash for this tip.`);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Daily Claim
// ---------------------------------------------------------------------------

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
    const streakExtra = Math.max(0, streak - 1) * config.daily.streakBonus;
    const breakdown =
      streakExtra > 0
        ? `\`${config.daily.reward} base\` + \`${streakExtra} streak\` = **${formatRC(amount)}** ${BRAND.ticker}`
        : `\`${config.daily.reward}\` ${BRAND.ticker} base reward`;

    // Award weekly-lottery tickets for the daily claim.
    if (interaction.guildId) {
      try {
        const cfg = await services.invite.admin.getConfig(interaction.guildId);
        if (cfg.lotteryEnabled && cfg.ticketsPerDaily > 0) {
          await services.lottery.grantTickets(interaction.guildId, interaction.user.id, 'daily', cfg.ticketsPerDaily);
        }
      } catch (err) {
        console.error('[Daily] lottery ticket grant failed:', err);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(maxed ? COLOR.JACKPOT : COLOR.WIN)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}`, iconURL: interaction.guild?.iconURL({ size: 256 }) ?? undefined })
      .setTitle(`${ICON.check} DAILY CLAIMED`)
      .setDescription(
        statusBanner(`${ICON.win}  REWARD COLLECTED  ${ICON.win}`, 'win') +
        `\n# + ${ICON.coin} ${formatRC(amount)}\n` +
        `${breakdown}\n` +
        `${LINE}`
      )
      .addFields(
        { 
          name: `${ICON.streak} STREAK`, 
          value: `${streakBar(streak, config.daily.maxStreak)}${maxed ? '\n`' + ICON.jackpot + ' MAX STREAK BONUS ACTIVE`' : ''}`, 
          inline: false 
        },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(newBalance)}`), inline: true },
        { name: SPACER, value: statBlock('STREAK', maxed ? `${streak} ${ICON.jackpot}` : `${streak}`), inline: true },
        { name: SPACER, value: statBlock('NEXT', `<t:${Math.floor(nextClaimAt.getTime() / 1000)}:R>`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Balance: ${ICON.coin} ${formatRC(newBalance)}` });
      
    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    const nextClaimAt = (err as Error & { nextClaimAt?: Date }).nextClaimAt;
    if (nextClaimAt) {
      const embed = new EmbedBuilder()
        .setColor(COLOR.LOSS)
        .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
        .setTitle(`${ICON.time} ON COOLDOWN`)
        .setDescription(
          statusBanner(`${ICON.loss}  ALREADY CLAIMED  ${ICON.loss}`, 'loss') +
          `\nCome back <t:${Math.floor(nextClaimAt.getTime() / 1000)}:R>\n` +
          `${LINE}\n` +
          `*Keep your streak alive!*`
        )
        .setTimestamp()
        .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
      await ephemeralEmbed(interaction, embed);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function handleStats(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  const activity = await services.user.getActivity(target.id);
  const inviteCount = await services.economy.getValidInviteCount(target.id);

  const embed = brandedEmbed(COLOR.ELECTRIC, formatRC(balance), interaction.guild)
    .setTitle(`${target.username.toUpperCase()}`)
    .setDescription(
      statusBanner('PLAYER STATISTICS', 'info') +
      `\n${heroAmount(formatRC(balance))}\n` +
      `${LINE}`
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: SPACER, value: statBlock('MESSAGES', `${activity.messageCount}`), inline: true },
      { name: SPACER, value: statBlock('VC TIME', `${activity.vcMinutes}m`), inline: true },
      { name: SPACER, value: statBlock('INVITES', `${inviteCount}`), inline: true }
    );
  await ephemeralEmbed(interaction, embed);
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

export async function handleRank(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const { rank, total } = await services.economy.getUserRank(target.id);
  const balance = await services.economy.getBalance(target.id);

  const rankBar = progressBar(Math.max(0, total - rank + 1), Math.max(1, total), 14);
  const topPct = total > 0 ? Math.max(1, Math.round((rank / total) * 100)) : 100;
  const isTop3 = rank <= 3;
  const medal = rank === 1 ? `${ICON.jackpot} 1ST` : rank === 2 ? '2ND' : rank === 3 ? '3RD' : `#${rank}`;
  
  const embed = brandedEmbed(isTop3 ? COLOR.JACKPOT : COLOR.BRAND, formatRC(balance), interaction.guild)
    .setTitle(`${ICON.chip} LEADERBOARD RANK`)
    .setDescription(
      statusBanner(isTop3 ? `${ICON.jackpot}  TOP PLAYER  ${ICON.jackpot}` : 'RANKING', isTop3 ? 'jackpot' : 'info') +
      `\n# ${medal}\n` +
      `*Top ${topPct}% of all holders*\n` +
      `${LINE}`
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'STANDING', value: rankBar, inline: false },
      { name: SPACER, value: statBlock('RANK', `#${rank} / ${total}`), inline: true },
      { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
    );
  await ephemeralEmbed(interaction, embed);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function handleTransactions(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? TRANSACTIONS_DEFAULT_LIMIT;
  const txs = await services.economy.getTransactions(interaction.user.id, limit);
  if (txs.length === 0) {
    await ephemeralReply(interaction, `${ICON.loss} No transactions found.`);
    return;
  }
  const balance = await services.economy.getBalance(interaction.user.id);
  const lines = txs.map((t) => {
    const credit = !String(t.amount).trim().startsWith('-');
    const icon = credit ? `\`${ICON.up}\`` : `\`${ICON.down}\``;
    return `${icon} **${t.amount} RC** · \`${t.type}\`\n   ${ICON.arrow} *${t.reason}*`;
  });
  
  const embed = brandedEmbed(COLOR.INFO, formatRC(balance), interaction.guild)
    .setTitle(`${ICON.bank} TRANSACTION HISTORY`)
    .setDescription(
      statusBanner('RECENT ACTIVITY', 'info') +
      `\n${LINE}\n` +
      lines.join('\n').slice(0, 3800)
    );
  await ephemeralEmbed(interaction, embed);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const limit = interaction.options.getInteger('limit') ?? LEADERBOARD_DEFAULT_LIMIT;
  const rows = await services.economy.getLeaderboard(limit);
  if (rows.length === 0) {
    await ephemeralReply(interaction, `${ICON.loss} No balances yet.`);
    return;
  }
  const topBalance = Number(rows[0]?.balance ?? 0) || 1;
  const lines = await Promise.all(
    rows.map(async (r, i) => {
      const user = await interaction.client.users.fetch(r.user_id).catch(() => null);
      const name = user?.username ?? r.user_id;
      const medal = i === 0 ? `\`${ICON.jackpot} 1ST\`` : i === 1 ? '`2ND`' : i === 2 ? '`3RD`' : `\`#${i + 1}\``;
      const bar = progressBar(Number(r.balance), topBalance, 10);
      return `${medal}  **${name}**\n    ${bar}  **${ICON.coin} ${r.balance}**`;
    })
  );
  const balance = await services.economy.getBalance(interaction.user.id);
  
  const embed = brandedEmbed(COLOR.JACKPOT, formatRC(balance), interaction.guild)
    .setTitle(`${ICON.chip} LEADERBOARD`)
    .setDescription(
      statusBanner(`${ICON.jackpot}  TOP ${rows.length} RICHEST  ${ICON.jackpot}`, 'jackpot') +
      `\n${LINE}\n` +
      lines.join('\n\n').slice(0, 3600)
    );
  await ephemeralEmbed(interaction, embed);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export async function handleInventory(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await services.user.ensureUser(interaction.user.id);
  const items = await services.user.getInventory(interaction.user.id);
  const balance = await services.economy.getBalance(interaction.user.id);
  
  if (items.length === 0) {
    const embed = brandedEmbed(COLOR.NEUTRAL, formatRC(balance), interaction.guild)
      .setTitle(`${ICON.chip} INVENTORY`)
      .setDescription(
        statusBanner('EMPTY STASH', 'neutral') +
        `\n${LINE}\n` +
        `No items yet — earn rewards from the shop, lottery, and referrals.`
      );
    await ephemeralEmbed(interaction, embed);
    return;
  }
  
  const lines = items.map((item) => {
    const meta = item.item_metadata ? ` · \`${JSON.stringify(item.item_metadata)}\`` : '';
    return `\`${ICON.rare} x${item.quantity}\`  **${item.item_type.replace(/_/g, ' ').toUpperCase()}**${meta}`;
  });
  
  const embed = brandedEmbed(COLOR.RARE, formatRC(balance), interaction.guild)
    .setTitle(`${ICON.chip} INVENTORY`)
    .setDescription(
      statusBanner(`${ICON.jackpot}  YOUR ITEMS  ${ICON.jackpot}`, 'jackpot') +
      `\n${LINE}\n` +
      lines.join('\n').slice(0, 3800)
    );
  await ephemeralEmbed(interaction, embed);
}
