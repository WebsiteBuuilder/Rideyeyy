"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteVerificationService = void 0;
const prisma_1 = require("../../lib/prisma");
// ═══════════════════════════════════════════════════════════════════════════
//  InviteVerificationService — decides whether an invited member is legitimate,
//  both at join time (immediate checks) and at reward time (final re-check).
// ═══════════════════════════════════════════════════════════════════════════
const DAY_MS = 24 * 60 * 60 * 1000;
class InviteVerificationService {
    /** Checks run the moment a member joins. */
    async immediateCheck(member, inviterId, config) {
        if (member.user.bot)
            return { ok: false, reason: 'BOT' };
        if (inviterId && inviterId === member.id) {
            return { ok: false, reason: 'SELF_INVITE' };
        }
        if (config.antiAltEnabled) {
            const ageMs = Date.now() - member.user.createdTimestamp;
            if (ageMs < config.minAccountAgeDays * DAY_MS) {
                return { ok: false, reason: 'ALT_ACCOUNT' };
            }
        }
        // Re-join / previously a member: any prior join row for this user in guild.
        const priorJoins = await prisma_1.prisma.inviteJoin.count({
            where: { guildId: member.guild.id, invitedUserId: member.id },
        });
        if (priorJoins > 0) {
            return { ok: false, reason: 'PREVIOUS_MEMBER' };
        }
        if (await this.wasBanned(member.guild, member.id)) {
            return { ok: false, reason: 'BAN_EVASION' };
        }
        return { ok: true };
    }
    /** Re-check at reward time: the member must still be present and valid. */
    async finalCheck(guild, userId, accountCreatedAt, config) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member)
            return { ok: false, reason: 'LEFT_EARLY' };
        if (member.user.bot)
            return { ok: false, reason: 'BOT' };
        if (config.antiAltEnabled && accountCreatedAt) {
            const ageMs = Date.now() - accountCreatedAt.getTime();
            if (ageMs < config.minAccountAgeDays * DAY_MS) {
                return { ok: false, reason: 'ALT_ACCOUNT' };
            }
        }
        if (await this.wasBanned(guild, userId)) {
            return { ok: false, reason: 'BAN_EVASION' };
        }
        return { ok: true };
    }
    async wasBanned(guild, userId) {
        try {
            const ban = await guild.bans.fetch(userId).catch(() => null);
            return ban != null;
        }
        catch {
            // Missing Ban Members permission — cannot determine, treat as not banned.
            return false;
        }
    }
}
exports.InviteVerificationService = InviteVerificationService;
