import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices, CrateType } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { formatRC } from '../utils/math';
import {
  ephemeralReply,
  checkCooldown,
  COLOR,
  LINE,
  THIN_LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  statusBanner,
} from '../utils/discord';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SYSTEM — Premium Reward Crates
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Crate Visual Definitions
// ---------------------------------------------------------------------------

const CRATE_META: Record<
  CrateType,
  { icon: string; label: string; color: number; cost: number; desc: string; rarity: string }
> = {
  bronze: {
    icon: ICON.common,
    label: 'BRONZE',
    color: 0xcd7f32,
    cost: config.crates.bronze,
    desc: 'Entry-level rewards',
    rarity: 'Common drops',
  },
  silver: {
    icon: ICON.uncommon,
    label: 'SILVER',
    color: 0xc0c0c0,
    cost: config.crates.silver,
    desc: 'Better odds, better loot',
    rarity: 'Uncommon+ drops',
  },
  gold: {
    icon: ICON.legendary,
    label: 'GOLD',
    color: COLOR.JACKPOT,
    cost: config.crates.gold,
    desc: 'Premium rewards, rare drops',
    rarity: 'Rare+ drops',
  },
};

// Rarity icons for reward display
const RARITY_ICON: Record<string, string> = {
  common:    ICON.common,
  uncommon:  ICON.uncommon,
  rare:      ICON.rare,
  epic:      ICON.epic,
  legendary: ICON.legendary,
};

function formatRewardLine(description: string): string {
  // Detect high-value rewards
  const isHighValue =
    /\d{3,}/.test(description) ||
    /rare|epic|legendary|role|ride/i.test(description);
  
  const icon = isHighValue ? ICON.rare : ICON.common;
  return isHighValue ? `> ${ICON.jackpot} **${description}**` : `> ${icon} ${description}`;
}

// ---------------------------------------------------------------------------
// Shop Embed
// ---------------------------------------------------------------------------

function buildShopEmbed(): EmbedBuilder {
  const lines = (['bronze', 'silver', 'gold'] as CrateType[]).map((t) => {
    const m = CRATE_META[t];
    return `### ${m.icon} ${m.label}\n\`${ICON.coin} ${formatRC(m.cost)}\` · *${m.desc}*\n\`${m.rarity}\``;
  });

  return new EmbedBuilder()
    .setColor(COLOR.JACKPOT)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(`${ICON.slot} CRATE SHOP`)
    .setDescription(
      statusBanner(`${ICON.jackpot}  PREMIUM REWARDS  ${ICON.jackpot}`, 'jackpot') +
      `\n${LINE}\n\n` +
      lines.join('\n\n')
    )
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Crate Buttons
// ---------------------------------------------------------------------------

export function buildCrateButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('crate:bronze')
      .setLabel(`${ICON.common} BRONZE`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('crate:silver')
      .setLabel(`${ICON.uncommon} SILVER`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('crate:gold')
      .setLabel(`${ICON.legendary} GOLD`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('crate:rewards')
      .setLabel('VIEW DROPS')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ---------------------------------------------------------------------------
// /crate Command
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName('crate')
  .setDescription('Open reward crates with Route Cash');

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await interaction.reply({
    embeds: [buildShopEmbed()],
    components: [buildCrateButtons()],
    ephemeral: true,
  });
}

// ---------------------------------------------------------------------------
// Crate Button Handler
// ---------------------------------------------------------------------------

export async function handleCrateButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action] = interaction.customId.split(':');
  if (!action) return;

  // ── Rewards Preview ──────────────────────────────────────────────────────
  if (action === 'rewards') {
    const summary = await services.crate.getAllRewardsSummary();
    const embed = new EmbedBuilder()
      .setColor(COLOR.RARE)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(`${ICON.slot} DROP TABLE`)
      .setDescription(
        statusBanner(`${ICON.rare}  ALL POSSIBLE DROPS  ${ICON.rare}`, 'info') +
        `\n${LINE}\n` +
        summary.slice(0, 3800)
      )
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` })
      .setTimestamp();
    await interaction.update({ embeds: [embed], components: [buildCrateButtons()] });
    return;
  }

  // ── Open a Crate ─────────────────────────────────────────────────────────
  const crateType = action as CrateType;
  if (!['bronze', 'silver', 'gold'].includes(crateType)) return;

  const cd = checkCooldown(interaction.user.id, 'crate', config.limits.crateCooldownMs);
  if (cd) {
    await interaction.reply({
      content: `${ICON.time} You're opening crates too fast — wait **${cd}s** before trying again.`,
      ephemeral: true,
    });
    return;
  }

  const meta = CRATE_META[crateType];

  try {
    await services.user.ensureUser(interaction.user.id);
    const guildId = interaction.guildId ?? interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: `${ICON.loss} This command must be used in a server.`, ephemeral: true });
      return;
    }

    const rewards  = await services.crate.openCrate(interaction.user.id, crateType, interaction.client, guildId);
    const balance  = await services.economy.getBalance(interaction.user.id);
    const rewardLines = rewards.map((r: any) => formatRewardLine(r.description));

    // Determine if any high-value item was won
    const hasRare = rewardLines.some((l: string) => l.includes(ICON.jackpot));
    const embedColor = hasRare ? (crateType === 'gold' ? COLOR.JACKPOT : COLOR.RARE) : meta.color;
    const statusStyle = hasRare ? 'jackpot' : 'win';
    const statusText = hasRare 
      ? `${ICON.jackpot}  RARE DROP  ${ICON.jackpot}` 
      : `${ICON.win}  OPENED  ${ICON.win}`;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(`${meta.icon} ${meta.label} CRATE${hasRare ? ` ${ICON.jackpot}` : ''}`)
      .setDescription(
        statusBanner(statusText, statusStyle) +
        `\n${LINE}\n\n` +
        `**REWARDS RECEIVED:**\n` +
        rewardLines.join('\n')
      )
      .addFields(
        { name: SPACER, value: statBlock('COST', `${ICON.coin} ${formatRC(meta.cost)}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.update({ embeds: [embed], components: [buildCrateButtons()] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      const currentBalance = await services.economy.getBalance(interaction.user.id);
      const needed = meta.cost - Number(currentBalance.toFixed(0));
      
      const embed = new EmbedBuilder()
        .setColor(COLOR.LOSS)
        .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
        .setTitle(`${ICON.loss} INSUFFICIENT FUNDS`)
        .setDescription(
          statusBanner(`${ICON.loss}  NOT ENOUGH RC  ${ICON.loss}`, 'loss') +
          `\nNeed **\`${ICON.coin} ${formatRC(meta.cost)}\`** for ${meta.label}\n` +
          `${LINE}\n` +
          (needed > 0 ? `Short by **${ICON.coin} ${needed}**` : '')
        )
        .setTimestamp()
        .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
        
      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: err instanceof Error ? err.message : `${ICON.loss} Failed to open crate.`,
      ephemeral: true,
    });
  }
}
