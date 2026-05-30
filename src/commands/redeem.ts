import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices, RedeemOption } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { formatRC } from '../utils/math';
import { ephemeralReply, memberFromInteraction, baseEmbed, ephemeralEmbed, COLOR, DIVIDER } from '../utils/discord';

// ---------------------------------------------------------------------------
// Redemption display metadata
// ---------------------------------------------------------------------------

const REDEEM_META: Record<RedeemOption, { label: string; icon: string; usd: number; rc: number }> = {
  one_dollar_credit:  { label: '$1 Ride Credit',   icon: '🎟️',  usd: 1,  rc: 1_500  },
  two_dollar_credit:  { label: '$2 Ride Credit',   icon: '🎟️',  usd: 2,  rc: 3_000  },
  five_dollar_credit: { label: '$5 Ride Credit',   icon: '🎫',  usd: 5,  rc: 7_000  },
  ten_dollar_credit:  { label: '$10 Ride Credit',  icon: '💳',  usd: 10, rc: 12_000 },
  free_ride:          { label: 'FREE Ride',         icon: '🚗',  usd: 20, rc: 20_000 },
};

export const data = new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Redeem Route Cash for ride credits')
  .addStringOption((o) =>
    o
      .setName('option')
      .setDescription('Redemption option')
      .setRequired(true)
      .addChoices(
        { name: '$1 Credit (1,500 RC)',     value: 'one_dollar_credit'  },
        { name: '$2 Credit (3,000 RC)',     value: 'two_dollar_credit'  },
        { name: '$5 Credit (7,000 RC)',     value: 'five_dollar_credit' },
        { name: '$10 Credit (12,000 RC)',   value: 'ten_dollar_credit'  },
        { name: 'FREE Ride (20,000 RC)',    value: 'free_ride'          }
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const option = interaction.options.getString('option', true) as RedeemOption;
  const member = memberFromInteraction(interaction);
  if (!member || !interaction.guildId) {
    await ephemeralReply(interaction, 'This command must be used in a server.');
    return;
  }

  const displayName = services.user.getDisplayName(member);
  const meta        = REDEEM_META[option] ?? { label: option, icon: '🎟️', usd: 0, rc: 0 };

  try {
    await services.user.ensureUser(interaction.user.id);
    const result = await services.redeem.redeemCredit(
      interaction.client,
      interaction.guildId,
      interaction.user.id,
      option,
      displayName
    );

    const balance = await services.economy.getBalance(interaction.user.id);

    const embed = baseEmbed(COLOR.WIN, formatRC(balance), interaction.guild)
      .setTitle(`${meta.icon}  Redemption Successful!`)
      .setDescription(
        `## ${meta.label}\n${DIVIDER}\n` +
        `Your nickname now shows your redemption:\n> **${result.taggedNickname}**` +
        (result.truncated ? '\n\n*Note: Nickname was trimmed to fit Discord\'s 32-character limit.*' : '')
      )
      .addFields(
        { name: '🎟 Redeemed',    value: meta.label,        inline: true },
        { name: '✦ RC Spent',    value: formatRC(meta.rc), inline: true },
        { name: '◈ New Balance', value: formatRC(balance), inline: true }
      );

    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      const balance = await services.economy.getBalance(interaction.user.id).catch(() => null);
      const needed  = meta.rc - (balance ? Number(balance.toFixed(0)) : 0);

      const errorEmbed = new EmbedBuilder()
        .setColor(COLOR.ERROR)
        .setTitle('✕  Not Enough Route Cash')
        .setDescription(
          `You need **${formatRC(meta.rc)}** to redeem **${meta.label}**.\n${DIVIDER}\n` +
          (balance !== null && needed > 0 ? `Short by **${needed} RC** — keep earning!` : '')
        )
        .addFields(
          { name: '✦ Required', value: formatRC(meta.rc),      inline: true },
          ...(balance !== null ? [{ name: '◈ Your Balance', value: formatRC(balance), inline: true }] : [])
        )
        .setFooter({ text: 'Guhd Rides' })
        .setTimestamp();

      await ephemeralEmbed(interaction, errorEmbed);
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Redemption failed.');
  }
}
