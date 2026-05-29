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
import { ephemeralReply, checkCooldown, COLOR } from '../utils/discord';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Crate visual definitions
// ---------------------------------------------------------------------------

const CRATE_META: Record<
  CrateType,
  { icon: string; label: string; color: number; cost: number; desc: string }
> = {
  bronze: {
    icon: '🟫',
    label: 'Bronze Crate',
    color: 0xcd7f32,
    cost: config.crates.bronze,
    desc: 'Entry-level rewards — a little something for the road.',
  },
  silver: {
    icon: '⬜',
    label: 'Silver Crate',
    color: 0xc0c0c0,
    cost: config.crates.silver,
    desc: 'Better odds. Better loot. Worth the upgrade.',
  },
  gold: {
    icon: '🟨',
    label: 'Gold Crate',
    color: COLOR.JACKPOT,
    cost: config.crates.gold,
    desc: 'Premium rewards. Rare drops. Top tier only.',
  },
};

// Rarity color mapping for reward lines
const RARITY_COLOR: Record<string, string> = {
  common:    '',
  uncommon:  '',
  rare:      '**',
  epic:      '**',
  legendary: '**',
};

function formatRewardLine(description: string): string {
  // Bold reward lines that look like a big RC amount or contain "rare" / "role"
  const isHighValue =
    /\d{3,}/.test(description) ||
    /rare|epic|legendary|role|ride/i.test(description);
  return isHighValue ? `> **${description}**` : `> ${description}`;
}

// ---------------------------------------------------------------------------
// Shop embed — shown when /crate is first used
// ---------------------------------------------------------------------------

function buildShopEmbed(): EmbedBuilder {
  const lines = (['bronze', 'silver', 'gold'] as CrateType[]).map((t) => {
    const m = CRATE_META[t];
    return `${m.icon}  **${m.label}** — \`${formatRC(m.cost)}\`\n${m.desc}`;
  });

  return new EmbedBuilder()
    .setColor(COLOR.JACKPOT)
    .setTitle('Route Cash Crates')
    .setDescription(
      'Spend your RC to open a crate and win rewards, roles, and ride credits.\n\n' +
      lines.join('\n\n')
    )
    .setFooter({ text: 'Select a crate below  •  Guhd Rides' })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Crate selector buttons
// ---------------------------------------------------------------------------

export function buildCrateButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('crate:bronze')
      .setLabel('Bronze')
      .setEmoji('🟫')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('crate:silver')
      .setLabel('Silver')
      .setEmoji('⬜')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('crate:gold')
      .setLabel('Gold')
      .setEmoji('🟨')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('crate:rewards')
      .setLabel('View All Rewards')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );
}

// ---------------------------------------------------------------------------
// /crate command
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
// Crate button handler
// ---------------------------------------------------------------------------

export async function handleCrateButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action] = interaction.customId.split(':');
  if (!action) return;

  // ── Rewards preview ──────────────────────────────────────────────────────
  if (action === 'rewards') {
    const summary = await services.crate.getAllRewardsSummary();
    const embed = new EmbedBuilder()
      .setColor(COLOR.JACKPOT)
      .setTitle('📋  Crate Rewards Overview')
      .setDescription(summary.slice(0, 4000))
      .setFooter({ text: 'Guhd Rides' })
      .setTimestamp();
    await interaction.update({ embeds: [embed], components: [buildCrateButtons()] });
    return;
  }

  // ── Open a crate ─────────────────────────────────────────────────────────
  const crateType = action as CrateType;
  if (!['bronze', 'silver', 'gold'].includes(crateType)) return;

  const cd = checkCooldown(interaction.user.id, 'crate', config.limits.crateCooldownMs);
  if (cd) {
    await interaction.reply({
      content: `You're opening crates too fast — wait **${cd}s** before trying again.`,
      ephemeral: true,
    });
    return;
  }

  const meta = CRATE_META[crateType];

  try {
    await services.user.ensureUser(interaction.user.id);
    const guildId = interaction.guildId ?? interaction.guild?.id;
    if (!guildId) {
      await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
      return;
    }

    const rewards  = await services.crate.openCrate(interaction.user.id, crateType, interaction.client, guildId);
    const balance  = await services.economy.getBalance(interaction.user.id);
    const rewardLines = rewards.map((r) => formatRewardLine(r.description));

    // Determine if any high-value item was won to boost the color
    const hasRare = rewardLines.some((l) => l.startsWith('> **'));
    const embedColor = hasRare ? (crateType === 'gold' ? COLOR.JACKPOT : COLOR.RARE) : meta.color;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${meta.icon}  ${meta.label} Opened!`)
      .setDescription(
        `**${interaction.user.username}** cracked open a ${meta.label}.\n\n` +
        rewardLines.join('\n')
      )
      .addFields({ name: 'New Balance', value: formatRC(balance), inline: true })
      .setFooter({ text: `Cost: ${formatRC(meta.cost)}  •  Guhd Rides` })
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [buildCrateButtons()] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      const needed = meta.cost - Number((await services.economy.getBalance(interaction.user.id)).toFixed(0));
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.ERROR)
            .setTitle('Not Enough Route Cash')
            .setDescription(
              `You need **${formatRC(meta.cost)}** to open a ${meta.label}.\n` +
              (needed > 0 ? `You're short **${needed} RC** — keep earning!` : '')
            )
            .setFooter({ text: 'Guhd Rides' })
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: err instanceof Error ? err.message : 'Failed to open crate.',
      ephemeral: true,
    });
  }
}
