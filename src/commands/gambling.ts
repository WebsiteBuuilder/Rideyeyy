import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import Decimal from 'decimal.js';
import type { AppServices, Card } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import {
  ephemeralReply,
  checkCooldown,
  gameEmbed,
  brandedEmbed,
  COLOR,
  LINE,
  THIN_LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  statusBanner,
  resultBanner,
  publicEmbed,
} from '../utils/discord';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Casino Experience
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Card Display Helpers
// ---------------------------------------------------------------------------

const SUIT_ICON: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_ICON[card.suit] ?? card.suit}`;
}

/** Premium card tile with clean styling */
function cardTile(card: Card): string {
  const isRed = card.suit === 'H' || card.suit === 'D';
  return `\`[ ${cardLabel(card)} ]\``;
}

const HIDDEN_TILE = '`[ ?? ]`';

function renderHand(hand: Card[], hideSecond = false): string {
  return hand
    .map((c, i) => (hideSecond && i === 1 ? HIDDEN_TILE : cardTile(c)))
    .join('  ');
}

function valueLabel(v: number, show: boolean): string {
  if (!show) return '**??**';
  if (v === 21) return `**21** \`${ICON.jackpot} BLACKJACK\``;
  if (v > 21)  return `**${v}** \`${ICON.loss} BUST\``;
  return `**${v}**`;
}

// ---------------------------------------------------------------------------
// Blackjack Result Metadata
// ---------------------------------------------------------------------------

const BJ_META: Record<string, { color: number; title: string; banner: string; style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' }> = {
  blackjack:   { color: COLOR.JACKPOT, title: 'BLACKJACK!',     banner: `${ICON.jackpot}  NATURAL 21  ${ICON.jackpot}`, style: 'jackpot' },
  win:         { color: COLOR.WIN,     title: 'YOU WIN',        banner: `${ICON.win}  WINNER  ${ICON.win}`,             style: 'win' },
  push:        { color: COLOR.NEUTRAL, title: 'PUSH',           banner: '≈  TIE GAME  ≈',                               style: 'neutral' },
  loss:        { color: COLOR.LOSS,    title: 'DEALER WINS',    banner: `${ICON.loss}  LOSS  ${ICON.loss}`,             style: 'loss' },
  bust:        { color: COLOR.LOSS,    title: 'BUST',           banner: `${ICON.loss}  OVER 21  ${ICON.loss}`,          style: 'loss' },
  surrender:   { color: COLOR.MUTED,   title: 'SURRENDERED',    banner: `${ICON.fold}  FOLDED  ${ICON.fold}`,           style: 'neutral' },
  timed_out:   { color: COLOR.LOSS,    title: 'TIMED OUT',      banner: `${ICON.time}  EXPIRED  ${ICON.time}`,          style: 'loss' },
  player_turn: { color: COLOR.ACTIVE,  title: 'BLACKJACK',      banner: `${ICON.cards}  YOUR TURN  ${ICON.cards}`,      style: 'info' },
};

// ---------------------------------------------------------------------------
// Blackjack Embed Builder
// ---------------------------------------------------------------------------

function buildBlackjackEmbed(
  services: AppServices,
  playerHand: Card[],
  dealerHand: Card[],
  bet: Decimal,
  showDealer: boolean,
  status = 'player_turn',
  extras?: { result?: string; payout?: Decimal; newBalance?: Decimal }
): EmbedBuilder {
  const meta = BJ_META[status] ?? BJ_META['loss'];
  const playerValue = services.gambling.handValue(playerHand);
  const dealerValue = showDealer
    ? services.gambling.handValue(dealerHand)
    : services.gambling.handValue([dealerHand[0]]);

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
    .setTitle(meta.title)
    .setDescription(
      statusBanner(meta.banner, meta.style) +
      `\n${LINE}`
    )
    .addFields(
      {
        name: `${ICON.cards} DEALER`,
        value: `${renderHand(dealerHand, !showDealer)}\n${valueLabel(dealerValue, showDealer)}`,
        inline: true,
      },
      {
        name: `${ICON.chip} YOU`,
        value: `${renderHand(playerHand)}\n${valueLabel(playerValue, true)}`,
        inline: true,
      }
    )
    .setFooter({ text: `Bet: ${ICON.coin} ${formatRC(bet)}  ·  ${BRAND.name}` })
    .setTimestamp();

  // Add payout info for completed games
  if (showDealer && extras?.payout !== undefined) {
    const won = extras.payout.gt(bet);
    const tied = extras.payout.eq(bet);
    const net = won ? extras.payout.sub(bet) : bet.sub(extras.payout);
    
    const netDisplay = tied 
      ? '`BET RETURNED`' 
      : won 
        ? `\`+ ${formatRC(net)}\` ${ICON.up}` 
        : `\`- ${formatRC(net)}\` ${ICON.down}`;

    embed.addFields(
      { name: SPACER, value: THIN_LINE, inline: false },
      { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(extras.payout)}`), inline: true },
      { name: SPACER, value: statBlock(won ? 'PROFIT' : tied ? 'NET' : 'LOSS', netDisplay), inline: true },
      ...(extras.newBalance !== undefined
        ? [{ name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(extras.newBalance)}`), inline: true }]
        : [])
    );
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Blackjack Buttons — Modern Casino Style
// ---------------------------------------------------------------------------

function buildBlackjackButtons(
  gameId: string,
  canDouble: boolean
): ActionRowBuilder<ButtonBuilder> {
  const btns: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`bj:hit:${gameId}`)
      .setLabel(`${ICON.hit} HIT`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${gameId}`)
      .setLabel(`${ICON.stand} STAND`)
      .setStyle(ButtonStyle.Success),
  ];

  if (canDouble) {
    btns.push(
      new ButtonBuilder()
        .setCustomId(`bj:double:${gameId}`)
        .setLabel(`${ICON.double} DOUBLE`)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  btns.push(
    new ButtonBuilder()
      .setCustomId(`bj:surrender:${gameId}`)
      .setLabel(`${ICON.fold} FOLD`)
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
        `You bet **${inlineRC(formatRC(amount))}** on **${choice.toUpperCase()}**`
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
        `Target: **${target}** for **${inlineRC(formatRC(amount))}**`
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
      ? buildBlackjackButtons(game.gameId, game.canDouble)
      : null;

    await interaction.reply({ embeds: [embed], components: row ? [row] : [], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to start game.');
  }
}

// ══════════════════��════════════════════════════════════════════════════════
//  BLACKJACK BUTTON HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action, gameId] = interaction.customId.split(':');
  if (!action || !gameId) return;

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
      await interaction.update({ embeds: [embed], components: [buildBlackjackButtons(gameId, canDouble)] });

    } else if (action === 'stand') {
      const result = await services.gambling.stand(gameId, interaction.user.id);
      const game   = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet    = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const embed = buildBlackjackEmbed(
        services, result.playerHand, result.dealerHand, bet, true, result.result,
        { payout: result.payout, newBalance: balance }
      );
      await interaction.update({ embeds: [embed], components: [] });

    } else if (action === 'double') {
      const result  = await services.gambling.doubleDown(gameId, interaction.user.id);
      const game    = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet     = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const status = result.busted ? 'bust' : result.result;
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

      const embed = new EmbedBuilder()
        .setColor(COLOR.MUTED)
        .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
        .setTitle('SURRENDERED')
        .setDescription(
          statusBanner(`${ICON.fold}  FOLDED EARLY  ${ICON.fold}`, 'neutral') +
          `\nHalf your bet has been returned.\n` +
          `${LINE}`
        )
        .addFields(
          { name: SPACER, value: statBlock('BET', `${ICON.coin} ${formatRC(bet)}`), inline: true },
          { name: SPACER, value: statBlock('RETURNED', `${ICON.coin} ${formatRC(bet.div(2))}`), inline: true },
          { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

      await interaction.update({ embeds: [embed], components: [] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: `${ICON.loss} Not enough Route Cash to double down.`, ephemeral: true });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Action failed.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}
