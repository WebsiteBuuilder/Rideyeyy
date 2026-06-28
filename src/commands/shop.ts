import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { RedemptionStatus } from '@prisma/client';
import type { AppServices } from '../types';
import { COLOR, BRAND, ICON, LINE, brandedEmbed, ephemeralEmbed, ephemeralReply, hasStaffRole } from '../utils/discord';
import { buildLotteryEmbed } from '../utils/casinoEmbeds';
import { config } from '../config';
import { nextLotteryDrawUtc } from '../utils/lotterySchedule';
import { getBalance } from '../lib/wallet';
import { ShopPurchaseError } from '../services/economy/ShopService';

// ═══════════════════════════════════════════════════════════════════════════
//  /shop     — spend Route Cash on ride rewards (added to rewards wallet)
//  /rewards  — view your active rewards wallet
//  /redeem   — staff consume a reward (by user select or legacy code)
//  /lottery  — weekly lottery pot, your tickets, and the last winner
// ═══════════════════════════════════════════════════════════════════════════

export const shopData = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Spend Route Cash on ride rewards');

export const rewardsData = new SlashCommandBuilder()
  .setName('rewards')
  .setDescription('View your active rewards wallet');

export const redeemData = new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Staff redeem a customer reward, or list your wallet')
  .addUserOption((o) =>
    o.setName('user').setDescription('Customer whose reward to redeem (staff only)')
  )
  .addStringOption((o) =>
    o.setName('code').setDescription('Legacy redemption code (staff only, optional)')
  );

export const lotteryData = new SlashCommandBuilder()
  .setName('lottery')
  .setDescription('View the weekly lottery pot, your tickets, and the last winner');

export const REDEEM_PICK_PREFIX = 'redeem:pick:';

function formatWalletLines(services: AppServices, rewards: Awaited<ReturnType<AppServices['redemption']['listAvailable']>>): string {
  if (!rewards.length) {
    return '_Your wallet is empty. Earn rewards via `/shop`, invite milestones, or the weekly lottery._';
  }
  return rewards.map((r) => services.redemption.formatRewardLine(r)).join('\n');
}

// ── /rewards ────────────────────────────────────────────────────────────────

export async function handleRewards(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const rewards = await services.redemption.listAvailable(guildId, interaction.user.id);
  const embed = brandedEmbed(COLOR.WIN)
    .setTitle(`${ICON.cards} Your Rewards Wallet`)
    .setDescription(
      `${LINE}\n` +
        `Active rewards can be applied during \`/book\`. Reserved rewards are attached to an open ticket.\n\n` +
        formatWalletLines(services, rewards)
    );
  await interaction.editReply({ embeds: [embed] });
}

// ── /shop ─────────────────────────────────────────────────────────────────--

export async function handleShop(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = await services.invite.admin.getConfig(guildId);
  const items = await services.shop.listItems(guildId);
  const balance = await getBalance(interaction.user.id);

  const itemLines = items.length
    ? items
        .map((i) => {
          const desc = i.description ? `\n_${i.description}_` : '';
          return `**${i.label}** — ${ICON.coin} ${i.priceRc} ${BRAND.ticker}${desc}`;
        })
        .join('\n\n')
    : '_The shop is empty right now._';

  const embed = brandedEmbed(COLOR.WIN)
    .setTitle(`🛒 Reward Shop`)
    .setDescription(
      `${LINE}\nYour balance: ${ICON.coin} **${balance.toFixed(0)}** ${BRAND.ticker}\n\n` +
        (cfg.shopEnabled ? itemLines : '_The shop is currently disabled._') +
        `\n\n_Purchases go to your rewards wallet — apply them during \`/book\`._`
    );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (cfg.shopEnabled) {
    let row = new ActionRowBuilder<ButtonBuilder>();
    items.forEach((item, idx) => {
      if (idx > 0 && idx % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder<ButtonBuilder>();
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop:buy:${item.key}`)
          .setLabel(`Buy ${item.label}`.slice(0, 80))
          .setStyle(ButtonStyle.Success)
      );
    });
    if (row.components.length) rows.push(row);
  }

  await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleShopButton(interaction: ButtonInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const key = interaction.customId.split(':')[2];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = await services.invite.admin.getConfig(guildId);
  try {
    const { item } = await services.shop.purchase(guildId, interaction.user.id, key, cfg.shopEnabled);
    const balance = await getBalance(interaction.user.id);
    const rewardLabel = services.redemption.label(item.rewardKey);
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.logo}  Reward Shop` })
      .setTitle(`${ICON.win} Purchase complete`)
      .setDescription(
        `You bought **${item.label}** for ${ICON.coin} **${item.priceRc}** ${BRAND.ticker}.\n\n` +
          `**${rewardLabel}** was added to your rewards wallet — apply it during \`/book\`.\n\n` +
          `Balance: ${ICON.coin} **${balance.toFixed(0)}** ${BRAND.ticker}`
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof ShopPurchaseError) {
      const msg =
        err.code === 'INSUFFICIENT_FUNDS'
          ? "You don't have enough Route Cash for that."
          : err.code === 'SHOP_DISABLED'
            ? 'The shop is currently disabled.'
            : 'That item is no longer available.';
      await interaction.editReply({ content: msg });
      return;
    }
    console.error('[Shop] purchase failed:', err);
    await interaction.editReply({ content: 'Purchase failed. Please try again.' });
  }
}

// ── /redeem ─────────────────────────────────────────────────────────────────

export async function handleRedeem(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }

  const code = interaction.options.getString('code');
  const targetUser = interaction.options.getUser('user');
  const member = interaction.member as GuildMember | null;
  const isStaff = member != null && hasStaffRole(member);

  if (code || targetUser) {
    if (!isStaff) {
      await ephemeralReply(interaction, 'Only staff can redeem rewards for customers.');
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (code) {
      const result = await services.redemption.redeem(guildId, code, interaction.user.id);
      if (result.ok && result.redemption) {
        const embed = new EmbedBuilder()
          .setColor(COLOR.WIN)
          .setAuthor({ name: `${BRAND.logo}  Redemption` })
          .setTitle(`${ICON.check} Legacy code redeemed`)
          .setDescription(
            `Reward: **${services.redemption.label(result.redemption.rewardKey)}**\n` +
              `Belongs to: <@${result.redemption.userId}>\n` +
              `Honor this reward for the customer.`
          )
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      const reason =
        result.reason === 'NOT_FOUND'
          ? 'No code matches that value.'
          : result.reason === 'WRONG_GUILD'
            ? 'That code is not valid for this server.'
            : 'That code has already been used or is no longer valid.';
      await interaction.editReply({ content: reason });
      return;
    }

    if (targetUser) {
      const rewards = await services.redemption.listAvailable(guildId, targetUser.id);
      if (!rewards.length) {
        await interaction.editReply({ content: `<@${targetUser.id}> has no active rewards in their wallet.` });
        return;
      }
      const options = rewards.slice(0, 25).map((r) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(services.redemption.label(r.rewardKey).slice(0, 100))
          .setValue(r.id)
          .setDescription(`${services.redemption.sourceLabel(r.source)}`.slice(0, 100))
      );
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${REDEEM_PICK_PREFIX}${targetUser.id}`)
          .setPlaceholder(`Select a reward for ${targetUser.username}`)
          .addOptions(options)
      );
      await interaction.editReply({
        content: `Redeem a reward for <@${targetUser.id}>:`,
        components: [row],
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const embed = brandedEmbed(COLOR.INFO)
    .setTitle(`${ICON.cards} Rewards Wallet`)
    .setDescription(
      `${LINE}\nUse \`/rewards\` to view your active rewards.\n\n` +
        `_Staff: use \`/redeem user:@member\` to redeem manually, or \`/redeem code:GR-...\` for legacy codes._`
    );
  await interaction.editReply({ embeds: [embed] });
}

export async function handleRedeemSelect(
  interaction: StringSelectMenuInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.customId.startsWith(REDEEM_PICK_PREFIX)) return;
  const guildId = interaction.guildId;
  if (!guildId) return;

  const member = interaction.member as GuildMember | null;
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'Only staff can redeem customer rewards.');
    return;
  }

  const targetUserId = interaction.customId.slice(REDEEM_PICK_PREFIX.length);
  const redemptionId = interaction.values[0];
  await interaction.deferUpdate();

  const result = await services.redemption.redeemById(guildId, redemptionId, interaction.user.id);
  if (result.ok && result.redemption) {
    await interaction.editReply({
      content: `${ICON.check} Redeemed **${services.redemption.label(result.redemption.rewardKey)}** for <@${targetUserId}>.`,
      components: [],
    });
    return;
  }
  const reason =
    result.reason === 'NOT_FOUND'
      ? 'That reward was not found.'
      : result.reason === 'WRONG_GUILD'
        ? 'That reward is not valid for this server.'
        : 'That reward has already been used or is no longer available.';
  await interaction.editReply({ content: reason, components: [] });
}

// ── /lottery ────────────────────────────────────────────────────────────────

export async function handleLottery(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  const cfg = await services.invite.admin.getConfig(guildId);
  const pot = await services.lottery.getPot(guildId);
  const mine = await services.lottery.getTickets(guildId, interaction.user.id);
  const last = await services.lottery.lastDraw(guildId);
  const odds = pot.totalTickets > 0 ? ((mine / pot.totalTickets) * 100).toFixed(1) : '0.0';
  const prize = services.redemption.label(cfg.lotteryPrizeKey);
  const { drawDayOfWeek, drawHourUtc } = config.economy.lottery;
  const nextDraw = nextLotteryDrawUtc(drawDayOfWeek, drawHourUtc, new Date());
  const nextUnix = Math.floor(nextDraw.getTime() / 1000);

  const embed = buildLotteryEmbed({
    mode: 'personal',
    prizeLabel: prize,
    totalTickets: pot.totalTickets,
    participants: pot.participants,
    nextDrawUnix: nextUnix,
    lastWinnerUserId: last?.winnerUserId ?? null,
    lastDrawUnix: last ? Math.floor(last.drawnAt.getTime() / 1000) : null,
    enabled: cfg.lotteryEnabled,
    yourTickets: mine,
    yourOdds: odds,
  });
  await ephemeralEmbed(interaction, embed);
}
