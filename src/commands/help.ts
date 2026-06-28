import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { config } from '../config';
import { BRAND, COLOR, ICON, LINE, brandedEmbed, ephemeralReply } from '../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  /help — new-user guide to verification, rides, Route Cash, casino & more
// ═══════════════════════════════════════════════════════════════════════════

export const HELP_NAV_ID = 'help:nav';

type HelpTopic =
  | 'start'
  | 'rides'
  | 'economy'
  | 'casino'
  | 'referrals'
  | 'shop'
  | 'providers';

const TOPICS: { value: HelpTopic; label: string; emoji: string; description: string }[] = [
  { value: 'start', label: 'Getting Started', emoji: '👋', description: 'Verify & access the server' },
  { value: 'rides', label: 'Book a Ride', emoji: '🚗', description: 'Order rides & deliveries' },
  { value: 'economy', label: 'Route Cash', emoji: '💰', description: 'Balance, daily, leaderboard' },
  { value: 'casino', label: 'Casino', emoji: '🎰', description: 'Coinflip, dice, blackjack' },
  { value: 'referrals', label: 'Referrals', emoji: '🎟️', description: 'Invite rewards & milestones' },
  { value: 'shop', label: 'Shop & Rewards', emoji: '🛒', description: 'Spend RC, rewards wallet, lottery' },
  { value: 'providers', label: 'Providers', emoji: '🛞', description: 'Drivers & ticket workflow' },
];

function channelRef(id: string): string {
  return id && id !== '0' ? `<#${id}>` : '_channel not set_';
}

function buildHelpEmbed(topic: HelpTopic): EmbedBuilder {
  const verify = channelRef(config.channels.verify);
  const order = channelRef(config.channels.orderHere);
  const casino = channelRef(config.channels.casino);
  const lottery = channelRef(config.channels.lottery);
  const firstOrderBonus = config.inviteEconomy.firstOrderBonusRc;

  switch (topic) {
    case 'start':
      return brandedEmbed(COLOR.ELECTRIC)
        .setTitle(`${ICON.check} Getting Started`)
        .setDescription(
          `${LINE}\n` +
            `Welcome to **${BRAND.name}**! Follow these steps when you join:\n\n` +
            `**1. Verify** — Go to ${verify} and tap **Verify**. Solve the quick math captcha.\n` +
            `You'll receive the **Rider** role and access to the rest of the server.\n\n` +
            `**2. Book a ride** — Head to ${order} or use \`/book\` anywhere.\n\n` +
            `**3. Earn ${BRAND.ticker}** — Claim \`/daily\`, invite friends, play casino games, or hit referral milestones.\n\n` +
            `**Key channels**\n` +
            `• Verify: ${verify}\n` +
            `• Order here: ${order}\n` +
            `• Casino: ${casino}`
        );

    case 'rides':
      return brandedEmbed(COLOR.ACTIVE)
        .setTitle('🚗 Book a Ride or Delivery')
        .setDescription(
          `${LINE}\n` +
            `**How to order**\n` +
            `• When bookings are **open**, tap **Book Now** in ${order} or run \`/book\`\n` +
            `• Staff may **close** bookings — the category turns red and new orders are paused until \`/open\`\n` +
            `• Choose **Ride** or **Courier Delivery**\n` +
            `• Pick a vehicle class (rides only)\n` +
            `• Optionally apply a reward from your wallet\n` +
            `• Paste **Google Maps links** for pickup and dropoff\n` +
            `• A private ticket channel opens for you and a provider\n\n` +
            `**In your ticket**\n` +
            `• **Claim** — provider accepts the job\n` +
            `• **Complete** — ride done; you'll get a DM to rate (4–5★ posts a public vouch)\n` +
            `• **Incomplete** — ride done with no review/vouch\n` +
            `• **Cancel** — staff only\n\n` +
            `_Tip: Have your Maps links ready before you start._`
        );

    case 'economy':
      return brandedEmbed(COLOR.WIN)
        .setTitle(`${ICON.coin} Route Cash (${BRAND.ticker})`)
        .setDescription(
          `${LINE}\n` +
            `**${BRAND.currency}** is the server currency. Earn it, spend it in the shop, or gamble in the casino.\n\n` +
            `**Wallet commands**\n` +
            `• \`/balance\` — check your balance\n` +
            `• \`/daily\` — **${config.daily.reward} ${BRAND.ticker}** once per day (+${config.daily.streakBonus} streak bonus, up to day ${config.daily.maxStreak})\n` +
            `• \`/pay\` — send ${BRAND.ticker} to someone\n` +
            `• \`/tip\` — quick tip a member\n` +
            `• \`/transactions\` — recent history\n` +
            `• \`/stats\` · \`/rank\` · \`/leaderboard\` — standings\n` +
            `• \`/inventory\` — reward items you've collected`
        );

    case 'casino':
      return brandedEmbed(COLOR.JACKPOT)
        .setTitle(`${BRAND.icon} Casino Games`)
        .setDescription(
          `${LINE}\n` +
            `Play in ${casino} (or anywhere commands work):\n\n` +
            `• \`/coinflip\` — heads or tails\n` +
            `• \`/dice\` — roll against a target number\n` +
            `• \`/blackjack\` — hit, stand, double, or surrender\n\n` +
            `_Gamble responsibly — only bet what you can afford to lose._`
        );

    case 'referrals':
      return brandedEmbed(COLOR.EPIC)
        .setTitle('🎟️ Referrals & Invites')
        .setDescription(
          `${LINE}\n` +
            `**Invite friends and earn ${BRAND.ticker}**\n\n` +
            `1. Share your personal Discord invite link\n` +
            `2. They join and **pass verification** in ${verify} → **30 ${BRAND.ticker}**\n` +
            `3. They complete their **first ride** → **${firstOrderBonus} ${BRAND.ticker}** bonus (once per invite)\n\n` +
            `**Commands**\n` +
            `• \`/invites\` — your stats, milestones, recent joins, and active rewards\n` +
            `• \`/invite-leaderboard\` — top inviters (all-time, weekly, monthly)\n\n` +
            `_Fake, self, or early-leave invites don't count._`
        );

    case 'shop':
      return brandedEmbed(COLOR.INFO)
        .setTitle('🛒 Shop, Rewards & Lottery')
        .setDescription(
          `${LINE}\n` +
            `**Reward Shop**\n` +
            `• \`/shop\` — browse items and spend ${BRAND.ticker}\n` +
            `• Purchases add rewards to your wallet (free rides, discounts)\n\n` +
            `**Rewards Wallet**\n` +
            `• \`/rewards\` — view active rewards\n` +
            `• Apply a reward during \`/book\` — it shows on your ticket and is consumed when the ride completes\n\n` +
            `**Weekly Lottery**\n` +
            `• Check the live panel in ${lottery !== '_channel not set_' ? lottery : 'the lottery channel'} — pot, countdown, last winner\n` +
            `• \`/lottery\` — view the pot and your tickets\n` +
            `• Tickets from dailies, invites, completed rides, and milestones\n` +
            `• One winner drawn each week — prize goes to your rewards wallet`
        );

    case 'providers':
      return brandedEmbed(COLOR.NEUTRAL)
        .setTitle('🛞 For Providers (Drivers)')
        .setDescription(
          `${LINE}\n` +
            `If you have the **Provider** role:\n\n` +
            `• Watch booking tickets — tap **Claim** on open jobs\n` +
            `• Coordinate with the customer in their private ticket\n` +
            `• **Complete** when done (triggers customer review) or **Incomplete** (no vouch)\n\n` +
            `**Stats**\n` +
            `• \`/provider-stats\` — your claims, completions, rating, revenue\n` +
            `• \`/provider-leaderboard\` — top drivers\n\n` +
            `**Operations (staff)**\n` +
            `• \`/open\` — accept new bookings and show the green category\n` +
            `• \`/close\` — pause bookings and show the red category\n` +
            `• \`/rc give user:@member amount:500\` — grant Route Cash\n` +
            `• \`/rc take user:@member amount:200\` — remove Route Cash\n\n` +
            `**Shop (administrator)**\n` +
            `• \`/shopadmin\` — add, edit, reorder, and remove shop items\n\n` +
            `_Need Provider access? Ask staff._`
        );

    default:
      return buildHelpEmbed('start');
  }
}

function navRow(active: HelpTopic): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_NAV_ID)
      .setPlaceholder('Browse another topic…')
      .addOptions(
        TOPICS.map((t) => ({
          label: t.label,
          value: t.value,
          description: t.description,
          emoji: t.emoji,
          default: t.value === active,
        }))
      )
  );
}

function helpView(topic: HelpTopic): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
} {
  return {
    embeds: [buildHelpEmbed(topic)],
    components: [navRow(topic)],
  };
}

export const helpData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Guide to GUHD RIDES — verify, book rides, earn Route Cash, and more')
  .addStringOption((o) =>
    o
      .setName('topic')
      .setDescription('Jump to a section')
      .setRequired(false)
      .addChoices(...TOPICS.map((t) => ({ name: t.label, value: t.value })))
  );

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }

  const topic = (interaction.options.getString('topic') as HelpTopic | null) ?? 'start';
  const valid = TOPICS.some((t) => t.value === topic) ? topic : 'start';
  const view = helpView(valid);
  await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

export async function handleHelpSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const topic = interaction.values[0] as HelpTopic;
  await interaction.update(helpView(topic));
}
