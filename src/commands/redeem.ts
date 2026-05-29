import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices, RedeemOption } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { ephemeralReply, memberFromInteraction } from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('redeem')
  .setDescription('Redeem Route Cash for ride credits')
  .addStringOption((o) =>
    o
      .setName('option')
      .setDescription('Redemption option')
      .setRequired(true)
      .addChoices(
        { name: '$1 Credit (1,500 RC)', value: 'one_dollar_credit' },
        { name: '$2 Credit (3,000 RC)', value: 'two_dollar_credit' },
        { name: '$5 Credit (7,000 RC)', value: 'five_dollar_credit' },
        { name: '$10 Credit (12,000 RC)', value: 'ten_dollar_credit' },
        { name: 'FREE Ride (20,000 RC)', value: 'free_ride' }
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

  try {
    await services.user.ensureUser(interaction.user.id);
    const result = await services.redeem.redeemCredit(
      interaction.client,
      interaction.guildId,
      interaction.user.id,
      option,
      displayName
    );
    let msg = `Redemption successful! Your nickname is now: **${result.taggedNickname}**`;
    if (result.truncated) {
      msg += '\n*Note: Your nickname was truncated to fit Discord\'s 32-character limit.*';
    }
    await ephemeralReply(interaction, msg);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash for this redemption.');
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Redemption failed.');
  }
}
