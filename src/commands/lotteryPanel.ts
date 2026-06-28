import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import type { AppServices } from '../types';
import { ephemeralReply, hasStaffRole, memberFromInteraction } from '../utils/discord';
import { buildLotteryEmbed } from '../utils/casinoEmbeds';
import { nextLotteryDrawUtc } from '../utils/lotterySchedule';
import { publishPanel } from './panels';

const PANEL_KEY = 'lottery';

export const lotteryPanelData = new SlashCommandBuilder()
  .setName('lotterypanel')
  .setDescription('Post or refresh the weekly lottery panel (staff only)');

async function resolveLotteryChannelId(guildId: string): Promise<string | null> {
  const cfg = await prisma.inviteConfig.findUnique({ where: { guildId } });
  const fromDb = cfg?.lotteryChannelId;
  if (fromDb && fromDb !== '0') return fromDb;
  const env = process.env['LOTTERY_CHANNEL_ID'];
  if (env && env !== '0') return env;
  return null;
}

export async function buildLotteryPanelEmbed(guildId: string, services: AppServices): Promise<EmbedBuilder> {
  const cfg = await services.invite.admin.getConfig(guildId);
  const pot = await services.lottery.getPot(guildId);
  const last = await services.lottery.lastDraw(guildId);
  const prize = services.redemption.label(cfg.lotteryPrizeKey);
  const { drawDayOfWeek, drawHourUtc } = config.economy.lottery;
  const nextDraw = nextLotteryDrawUtc(drawDayOfWeek, drawHourUtc, new Date());
  const nextUnix = Math.floor(nextDraw.getTime() / 1000);

  return buildLotteryEmbed({
    mode: 'panel',
    prizeLabel: prize,
    totalTickets: pot.totalTickets,
    participants: pot.participants,
    nextDrawUnix: nextUnix,
    lastWinnerUserId: last?.winnerUserId ?? null,
    lastDrawUnix: last ? Math.floor(last.drawnAt.getTime() / 1000) : null,
    enabled: cfg.lotteryEnabled,
  });
}

export async function ensureLotteryPanel(client: Client, services: AppServices, guildId?: string): Promise<void> {
  const guilds = guildId ? [guildId] : [...client.guilds.cache.keys()];
  for (const gid of guilds) {
    const channelId = await resolveLotteryChannelId(gid);
    if (!channelId) continue;
    try {
      const embed = await buildLotteryPanelEmbed(gid, services);
      await prisma.panel.upsert({
        where: { key: PANEL_KEY },
        create: { key: PANEL_KEY, content: 'lottery', channelId },
        update: { channelId },
      });
      await publishPanel(client, PANEL_KEY, channelId, embed, []);
    } catch (err) {
      console.warn(`[Bot] Lottery panel ensure failed for guild ${gid}:`, err);
    }
  }
}

export async function handleLotteryPanel(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'You must be staff to manage this panel.');
    return;
  }
  if (!interaction.guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = await resolveLotteryChannelId(interaction.guildId);
  if (!channelId) {
    await ephemeralReply(interaction, 'Lottery channel is not configured. Set it in `/admin economy` → Set Channels or `LOTTERY_CHANNEL_ID`.');
    return;
  }

  try {
    await ensureLotteryPanel(interaction.client, services, interaction.guildId);
    await ephemeralReply(interaction, `Lottery panel posted in <#${channelId}>.`);
  } catch (err) {
    console.error('[Bot] Failed to publish lottery panel:', err);
    await ephemeralReply(interaction, 'Failed to post the lottery panel. Check my permissions in that channel.');
  }
}
