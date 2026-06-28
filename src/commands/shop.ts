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
//  /shop    — spend RouteCash on ride rewards (issues a redemption code)
//  /redeem  — staff consume a code (or, with no code, list your own codes)
//  /lottery — weekly lottery pot, your tickets, and the last winner
// ═══════════════════════════════════════════════════════════════════════════

export const shopData = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Spend Route Cash on ride rewards');

export const redeemData = new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Redeem a reward code (staff), or list your own active codes')
  .addStringOption((o) => o.setName('code').setDescription('The redemption code to mark as used (staff only)').setRequired(false));

export const lotteryData = new SlashCommandBuilder()
  .setName('lottery')
  .setDescription('View the weekly lottery pot, your tickets, and the last winner');

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

  const embed = brandedEmbed(COLOR.WIN)
    .setTitle(`🛒 Reward Shop`)
    .setDescription(
      `${LINE}\nYour balance: ${ICON.coin} **${balance.toFixed(0)}** ${BRAND.ticker}\n\n` +
        (cfg.shopEnabled
          ? items.length
            ? items.map((i) => `**${i.label}** — ${ICON.coin} ${i.priceRc} ${BRAND.ticker}`).join('\n')
            : '_The shop is empty right now._'
          : '_The shop is currently disabled._')
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
  // customId: shop:buy:<key>
  const key = interaction.customId.split(':')[2];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cfg = await services.invite.admin.getConfig(guildId);
  try {
    const { item, redemption } = await services.shop.purchase(guildId, interaction.user.id, key, cfg.shopEnabled);
    const balance = await getBalance(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.logo}  Reward Shop` })
      .setTitle(`${ICON.win} Purchase complete`)
      .setDescription(
        `You bought **${item.label}** for ${ICON.coin} **${item.priceRc}** ${BRAND.ticker}.\n\n` +
          `Your code: \`${redemption.code}\`\n_Show it to staff in your booking ticket to claim it._\n\n` +
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

  // No code → list the caller's own active codes.
  if (!code) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const codes = await services.redemption.listForUser(guildId, interaction.user.id, RedemptionStatus.ACTIVE);
    const embed = brandedEmbed(COLOR.INFO)
      .setTitle(`${ICON.cards} Your Reward Codes`)
      .setDescription(
        codes.length
          ? `${LINE}\n` +
            codes
              .map((c) => `\`${c.code}\` — **${services.redemption.label(c.rewardKey)}** _(${c.source.toLowerCase()})_`)
              .join('\n')
          : `${LINE}\nYou have no active reward codes. Earn them via /shop, milestones, or the weekly lottery.`
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Code provided → staff-only consume.
  const member = interaction.member as GuildMember | null;
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'Only staff can redeem a customer code.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await services.redemption.redeem(guildId, code, interaction.user.id);
  if (result.ok && result.redemption) {
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.logo}  Redemption` })
      .setTitle(`${ICON.check} Code redeemed`)
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
}

// ── /lottery ─────────────────────────────────────────────────────────────---

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
