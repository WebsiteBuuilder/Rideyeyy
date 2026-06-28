import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import Decimal from 'decimal.js';
import type { AppServices } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import {
  ephemeralReply,
  checkCooldown,
  enforceCasinoChannel,
  COLOR,
  LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  statusBanner,
} from '../utils/discord';
import { buildBlackjackEmbed, type BJStatus } from '../utils/casinoEmbeds';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Casino Experience
// ═══════════════════════════════════════════════════════════════════════════

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ---------------------------------------------------------------------------
// Blackjack Buttons — Modern Casino Style
// ---------------------------------------------------------------------------

function buildBlackjackButtons(
  gameId: string,
  canDouble: boolean,
  ownerId: string
): ActionRowBuilder<ButtonBuilder> {
  const btns: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`bj:hit:${gameId}:${ownerId}`)
      .setLabel('HIT')
      .setEmoji('🃏')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${gameId}:${ownerId}`)
      .setLabel('STAND')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Success),
  ];

  if (canDouble) {
    btns.push(
      new ButtonBuilder()
        .setCustomId(`bj:double:${gameId}:${ownerId}`)
        .setLabel('DOUBLE')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Primary)
    );
  }

  btns.push(
    new ButtonBuilder()
      .setCustomId(`bj:surrender:${gameId}:${ownerId}`)
      .setLabel('FOLD')
      .setEmoji('🏳️')
      .setStyle(ButtonStyle.Danger)
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns.slice(0, 5));
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const coinflipData = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Flip a coin for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('choice')
      .setDescription('Heads or tails')
      .setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
  );

export const diceData = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('Roll the dice for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addIntegerOption((o) =>
    o.setName('target').setDescription('Target number 1-6').setMinValue(1).setMaxValue(6).setRequired(true)
  );

export const blackjackData = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play a hand of blackjack')
  .addStringOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true));

// ═══════════════════════════════════════════════════════════════════════════
//  COINFLIP — Quick Casino Game
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCoinflip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!(await enforceCasinoChannel(interaction))) return;
  const cd = checkCooldown(interaction.user.id, 'coinflip', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `${ICON.time} Slow down — wait **${cd}s** before flipping again.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const choice = interaction.options.getString('choice', true) as 'heads' | 'tails';
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.coinflip(interaction.user.id, amount, choice);
    const balance = await services.economy.getBalance(interaction.user.id);

    const won = result.won;
    const coinIcon = result.outcome === 'heads' ? '🪙' : '⚪';
    
    const embed = new EmbedBuilder()
      .setColor(won ? COLOR.WIN : COLOR.LOSS)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(won ? 'WINNER!' : 'LOSS')
      .setDescription(
        statusBanner(
          won ? `${ICON.win}  YOU WIN  ${ICON.win}` : `${ICON.loss}  MISS  ${ICON.loss}`,
          won ? 'win' : 'loss'
        ) +
        `\n## ${coinIcon} ${result.outcome.toUpperCase()}\n` +
        `${LINE}\n` +
        `You bet \`${ICON.coin} ${formatRC(amount)}\` on **${choice.toUpperCase()}**`
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DICE — Target Number Game
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDice(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!(await enforceCasinoChannel(interaction))) return;
  const cd = checkCooldown(interaction.user.id, 'dice', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `${ICON.time} Slow down — wait **${cd}s** before rolling again.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const target = interaction.options.getInteger('target', true);
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.dice(interaction.user.id, amount, target);
    const balance = await services.economy.getBalance(interaction.user.id);

    const isExact    = result.roll === target;
    const isAdjacent = !isExact && result.net.gt(0);
    const color      = isExact ? COLOR.JACKPOT : isAdjacent ? COLOR.WIN : COLOR.LOSS;
    const won        = result.net.gt(0);

    const rolledFace = DICE_FACE[result.roll] ?? `${result.roll}`;
    const statusText = isExact ? `${ICON.jackpot}  JACKPOT  ${ICON.jackpot}` : isAdjacent ? `${ICON.win}  CLOSE  ${ICON.win}` : `${ICON.loss}  MISS  ${ICON.loss}`;
    const style = isExact ? 'jackpot' : isAdjacent ? 'win' : 'loss';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(isExact ? 'JACKPOT!' : isAdjacent ? 'CLOSE!' : 'MISS')
      .setDescription(
        statusBanner(statusText, style) +
        `\n## ${rolledFace}  You rolled **${result.roll}**\n` +
        `${LINE}\n` +
        `Target: **${target}** for \`${ICON.coin} ${formatRC(amount)}\``
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Card Game
// ═══════════════════════════════════════════════════════════════════════════

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!(await enforceCasinoChannel(interaction))) return;
  try {
    const bet = parseAmount(interaction.options.getString('bet', true));
    await services.user.ensureUser(interaction.user.id);
    const game = await services.gambling.startBlackjack(interaction.user.id, bet);

    const isCompleted = game.status === 'completed';
    const balance = isCompleted ? await services.economy.getBalance(interaction.user.id) : undefined;

    const embed = buildBlackjackEmbed(
      services,
      game.playerHand,
      game.dealerHand,
      bet,
      isCompleted,
      isCompleted ? 'blackjack' : 'player_turn',
      isCompleted && balance !== undefined
        ? { newBalance: balance }
        : undefined
    );

    const row = game.status === 'player_turn'
      ? buildBlackjackButtons(game.gameId, game.canDouble, interaction.user.id)
      : null;

    await interaction.reply({ embeds: [embed], components: row ? [row] : [] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to start game.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK BUTTON HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action, gameId, ownerId] = interaction.customId.split(':');
  if (!action || !gameId) return;

  // The game message is public — only the player who started it may act.
  if (ownerId && ownerId !== interaction.user.id) {
    await interaction.reply({
      content: `${ICON.cross} This isn't your blackjack game — start your own with \`/blackjack\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    if (action === 'hit') {
      const { playerHand, busted } = await services.gambling.hit(gameId, interaction.user.id);
      const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet = new Decimal(game?.bet_amount ?? 0);

      if (busted) {
        const balance = await services.economy.getBalance(interaction.user.id);
        const embed = buildBlackjackEmbed(
          services, playerHand, game?.dealer_hand_json ?? [], bet, true, 'bust',
          { payout: new Decimal(0), newBalance: balance }
        );
        await interaction.update({ embeds: [embed], components: [] });
        return;
      }

      const canDouble = game ? game.player_hand_json.length === 2 && !game.doubled : false;
      const embed = buildBlackjackEmbed(services, playerHand, game!.dealer_hand_json, bet, false);
      await interaction.update({ embeds: [embed], components: [buildBlackjackButtons(gameId, canDouble, interaction.user.id)] });

    } else if (action === 'stand') {
      const result = await services.gambling.stand(gameId, interaction.user.id);
      const game   = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet    = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const embed = buildBlackjackEmbed(
        services, result.playerHand, result.dealerHand, bet, true, result.result as BJStatus,
        { payout: result.payout, newBalance: balance }
      );
      await interaction.update({ embeds: [embed], components: [] });

    } else if (action === 'double') {
      const result  = await services.gambling.doubleDown(gameId, interaction.user.id);
      const game    = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet     = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const status = (result.busted ? 'bust' : result.result) as BJStatus;
      const embed = buildBlackjackEmbed(
        services, result.playerHand, result.dealerHand ?? game?.dealer_hand_json ?? [], bet, true, status,
        { payout: result.payout ?? new Decimal(0), newBalance: balance }
      );
      await interaction.update({ embeds: [embed], components: [] });

    } else if (action === 'surrender') {
      await services.gambling.surrender(gameId, interaction.user.id);
      const balance = await services.economy.getBalance(interaction.user.id);
      const game    = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet     = new Decimal(game?.bet_amount ?? 0);
      const returned = bet.div(2);

      const embed = buildBlackjackEmbed(
        services,
        game?.player_hand_json ?? [],
        game?.dealer_hand_json ?? [],
        bet,
        true,
        'surrender',
        { payout: returned, newBalance: balance }
      );

      await interaction.update({ embeds: [embed], components: [] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: `${ICON.loss} Not enough Route Cash to double down.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Action failed.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  }
}
