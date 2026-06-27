"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteLoggingService = void 0;
const discord_js_1 = require("discord.js");
const prisma_1 = require("../../lib/prisma");
const discord_1 = require("../../utils/discord");
class InviteLoggingService {
    async log(entry, sink) {
        try {
            await prisma_1.prisma.inviteLog.create({
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
        }
        catch (err) {
            console.error('[Invite] Failed to persist InviteLog:', err);
        }
        console.log(`[Invite] ${entry.event}${entry.detail ? ` — ${entry.detail}` : ''}`);
        if (sink?.client && sink.channelId && sink.channelId !== '0') {
            try {
                const channel = await sink.client.channels.fetch(sink.channelId).catch(() => null);
                if (channel && channel.isTextBased() && !channel.isDMBased()) {
                    await channel.send({ embeds: [this.buildLogEmbed(entry)] });
                }
            }
            catch (err) {
                console.error('[Invite] Failed to mirror log to channel:', err);
            }
        }
    }
    async recent(guildId, limit = 15) {
        return prisma_1.prisma.inviteLog.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { event: true, detail: true, createdAt: true, targetUserId: true },
        });
    }
    buildLogEmbed(entry) {
        const lines = [];
        if (entry.actorId)
            lines.push(`**Inviter:** <@${entry.actorId}>`);
        if (entry.targetUserId)
            lines.push(`**Member:** <@${entry.targetUserId}>`);
        if (entry.inviteCode)
            lines.push(`**Code:** \`${entry.inviteCode}\``);
        if (entry.detail)
            lines.push(entry.detail);
        return new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.INFO)
            .setAuthor({ name: `${discord_1.BRAND.logo}  Invite Log` })
            .setTitle(entry.event)
            .setDescription(lines.join('\n') || '\u200b')
            .setTimestamp();
    }
}
exports.InviteLoggingService = InviteLoggingService;
