import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from '../../lib/prisma';
import { COLOR, BRAND } from '../../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteLoggingService — persists every invite event to InviteLog and (when
//  configured) mirrors it to a Discord logging channel.
// ═══════════════════════════════════════════════════════════════════════════

export interface InviteLogEntry {
  guildId: string;
  event: string;
  actorId?: string | null;
  targetUserId?: string | null;
  inviteCode?: string | null;
  joinId?: string | null;
  detail?: string | null;
}

export interface InviteLogSink {
  client?: Client;
  channelId?: string | null;
}

export class InviteLoggingService {
  async log(entry: InviteLogEntry, sink?: InviteLogSink): Promise<void> {
    try {
      await prisma.inviteLog.create({
        data: {
          guildId: entry.guildId,
          event: entry.event,
          actorId: entry.actorId ?? null,
          targetUserId: entry.targetUserId ?? null,
          inviteCode: entry.inviteCode ?? null,
          joinId: entry.joinId ?? null,
          detail: entry.detail ?? null,
        },
      });
    } catch (err) {
      console.error('[Invite] Failed to persist InviteLog:', err);
    }

    console.log(`[Invite] ${entry.event}${entry.detail ? ` — ${entry.detail}` : ''}`);

    if (sink?.client && sink.channelId && sink.channelId !== '0') {
      try {
        const channel = await sink.client.channels.fetch(sink.channelId).catch(() => null);
        if (channel && channel.isTextBased() && !channel.isDMBased()) {
          await (channel as TextChannel).send({ embeds: [this.buildLogEmbed(entry)] });
        }
      } catch (err) {
        console.error('[Invite] Failed to mirror log to channel:', err);
      }
    }
  }

  async recent(guildId: string, limit = 15): Promise<
    { event: string; detail: string | null; createdAt: Date; targetUserId: string | null }[]
  > {
    return prisma.inviteLog.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { event: true, detail: true, createdAt: true, targetUserId: true },
    });
  }

  private buildLogEmbed(entry: InviteLogEntry): EmbedBuilder {
    const lines: string[] = [];
    if (entry.actorId) lines.push(`**Inviter:** <@${entry.actorId}>`);
    if (entry.targetUserId) lines.push(`**Member:** <@${entry.targetUserId}>`);
    if (entry.inviteCode) lines.push(`**Code:** \`${entry.inviteCode}\``);
    if (entry.detail) lines.push(entry.detail);

    return new EmbedBuilder()
      .setColor(COLOR.INFO)
      .setAuthor({ name: `${BRAND.logo}  Invite Log` })
      .setTitle(entry.event)
      .setDescription(lines.join('\n') || '\u200b')
      .setTimestamp();
  }
}
