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
  COLOR,
  LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  statusBanner,
} from '../utils/discord';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

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

export const leaderboardData = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top Route Cash holders')
  .addIntegerOption((o) =>
    o.setName('limit').setDescription('Number of users').setMinValue(1).setMaxValue(25).setRequired(false)
  );

export const inventoryData = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your crate rewards and items');

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export async function handleBalance(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);
  
  const embed = new EmbedBuilder()
    .setColor(COLOR.WIN)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${ICON.wallet} ${target.username}'s Wallet`)
    .setDescription(
      `# ${ICON.coin} ${formatRC(balance)}\n` +
      `${LINE}\n` +
      statusBanner('ROUTE CASH BALANCE', 'info')
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
    
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

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
    
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(`${ICON.check} TRANSFER COMPLETE`)
      .setDescription(
        statusBanner(`${ICON.win}  SENT SUCCESSFULLY  ${ICON.win}`, 'win') +
        `\n**${ICON.coin} ${formatRC(amount)}** → <@${recipient.id}>\n` +
        `${LINE}`
      )
      .addFields(
        { name: SPACER, value: statBlock('TO', `<@${recipient.id}>`), inline: true },
        { name: SPACER, value: statBlock('AMOUNT', `${ICON.coin} ${formatRC(amount)}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(newBalance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
      
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Insufficient Route Cash for this transfer.`);
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
      .setColor(COLOR.WIN)
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
      
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Insufficient Route Cash for this tip.`);
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
    const { amount } = await services.economy.claimDaily(
      interaction.user.id,
      config.daily.reward,
      config.daily.cooldownHours
    );
    const newBalance = await services.economy.getBalance(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(`${ICON.check} DAILY CLAIMED`)
      .setDescription(
        statusBanner(`${ICON.win}  REWARD COLLECTED  ${ICON.win}`, 'win') +
        `\n# + ${ICON.coin} ${formatRC(amount)}\n` +
        `${LINE}`
      )
      .addFields(
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(newBalance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
      
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to claim daily.');
  }
}

export async function handleStats(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);

  const embed = new EmbedBuilder()
    .setColor(COLOR.WIN)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${target.username.toUpperCase()}`)
    .setDescription(
      statusBanner('PLAYER STATISTICS', 'info') +
      `\n# ${ICON.coin} ${formatRC(balance)}\n` +
      `${LINE}`
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setTimestamp()
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleRank(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await services.user.ensureUser(target.id);
  const balance = await services.economy.getBalance(target.id);

  const embed = new EmbedBuilder()
    .setColor(COLOR.WIN)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${ICON.chip} LEADERBOARD RANK`)
    .setDescription(
      statusBanner('RANKING', 'info') +
      `\n# #1\n` +
      `${LINE}`
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(COLOR.JACKPOT)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${ICON.chip} LEADERBOARD`)
    .setDescription(
      statusBanner(`${ICON.jackpot}  TOP RICHEST  ${ICON.jackpot}`, 'jackpot') +
      `\n${LINE}\n` +
      `Leaderboard coming soon!`
    )
    .setTimestamp()
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleInventory(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await services.user.ensureUser(interaction.user.id);
  const balance = await services.economy.getBalance(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(COLOR.NEUTRAL)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${ICON.chip} INVENTORY`)
    .setDescription(
      statusBanner('EMPTY STASH', 'neutral') +
      `\n${LINE}\n` +
      `Open a crate with \`/crate\` to start collecting!`
    )
    .addFields(
      { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
    )
    .setTimestamp()
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

