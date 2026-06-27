"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberVerifyService = void 0;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const config_1 = require("../../config");
const discord_1 = require("../../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  MemberVerifyService — one-time captcha screener; grants Rider role and
//  triggers invite RC payout when an invited member completes verification.
// ═══════════════════════════════════════════════════════════════════════════
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
class MemberVerifyService {
    constructor(invite) {
        this.invite = invite;
        this.captchaStore = new Map();
    }
    /** Assign Unverified role on join (best-effort). */
    async onMemberAdd(member) {
        if (member.user.bot)
            return;
        const roleId = config_1.config.roles.unverified;
        if (roleId === '0')
            return;
        const alreadyVerified = await prisma_1.prisma.memberVerification.findUnique({
            where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
        });
        if (alreadyVerified)
            return;
        try {
            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(roleId);
            }
        }
        catch (err) {
            console.warn('[Verify] Could not assign Unverified role:', err.message);
        }
    }
    /** Create a math captcha for the user; returns the question text. */
    createCaptcha(userId) {
        const a = 3 + Math.floor(Math.random() * 10);
        const b = 3 + Math.floor(Math.random() * 10);
        this.captchaStore.set(userId, { answer: a + b, expiresAt: Date.now() + CAPTCHA_TTL_MS });
        return `What is ${a} + ${b}?`;
    }
    /** Show the captcha modal (call from button handler). */
    buildCaptchaPrompt(userId) {
        return this.createCaptcha(userId);
    }
    async completeCaptcha(client, member, answerRaw) {
        const guildId = member.guild.id;
        const userId = member.id;
        const existing = await prisma_1.prisma.memberVerification.findUnique({
            where: { guildId_userId: { guildId, userId } },
        });
        if (existing) {
            return { ok: true, alreadyVerified: true };
        }
        const challenge = this.captchaStore.get(userId);
        this.captchaStore.delete(userId);
        if (!challenge || Date.now() > challenge.expiresAt) {
            return { ok: false, reason: 'expired', message: 'Captcha expired. Press Verify again.' };
        }
        const parsed = Number(String(answerRaw).trim());
        if (!Number.isFinite(parsed) || parsed !== challenge.answer) {
            return { ok: false, reason: 'wrong_captcha', message: 'Incorrect answer. Press Verify to try again.' };
        }
        const cfg = await this.invite.admin.ensureConfig(guildId);
        const check = await this.invite.verification.finalCheck(member.guild, userId, member.user.createdAt, cfg);
        if (!check.ok && !check.defer) {
            return { ok: false, reason: 'failed_check', message: 'Verification failed. Contact staff if you believe this is an error.' };
        }
        const join = await prisma_1.prisma.inviteJoin.findFirst({
            where: {
                guildId,
                invitedUserId: userId,
                status: client_1.InviteStatus.PENDING,
                inviterUserId: { not: null },
            },
            orderBy: { joinedAt: 'desc' },
        });
        await prisma_1.prisma.memberVerification.create({
            data: {
                guildId,
                userId,
                inviterUserId: join?.inviterUserId ?? null,
            },
        });
        await this.applyRoles(member);
        if (join?.inviterUserId) {
            await prisma_1.prisma.inviteJoin.update({
                where: { id: join.id },
                data: { screenerVerifiedAt: new Date() },
            });
            await this.invite.reward.rewardJoin(client, member.guild, join, cfg);
        }
        try {
            const welcome = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.WIN)
                .setAuthor({ name: `${discord_1.BRAND.logo}  Welcome` })
                .setTitle(`${discord_1.ICON.check} You're verified!`)
                .setDescription('You now have access to the server. Enjoy your ride!')
                .setTimestamp();
            await member.send({ embeds: [welcome] });
        }
        catch {
            /* DMs closed */
        }
        return { ok: true };
    }
    async isVerified(guildId, userId) {
        const row = await prisma_1.prisma.memberVerification.findUnique({
            where: { guildId_userId: { guildId, userId } },
        });
        return row != null;
    }
    /** DM all screener-verified members the backup server invite link. */
    async pullMembersToBackup(client, guildId) {
        const url = config_1.config.backup.serverInviteUrl;
        if (!url)
            throw new Error('BACKUP_SERVER_INVITE_URL is not configured.');
        const members = await prisma_1.prisma.memberVerification.findMany({ where: { guildId } });
        let sent = 0;
        let failed = 0;
        for (const row of members) {
            try {
                const user = await client.users.fetch(row.userId);
                await user.send(`**${discord_1.BRAND.name} — Server Backup**\n\nOur community has moved. Join us here:\n${url}`);
                sent++;
            }
            catch {
                failed++;
            }
            await sleep(200);
        }
        return { sent, failed, total: members.length };
    }
    async applyRoles(member) {
        const riderId = config_1.config.roles.rider;
        const unverifiedId = config_1.config.roles.unverified;
        try {
            if (unverifiedId !== '0' && member.roles.cache.has(unverifiedId)) {
                await member.roles.remove(unverifiedId);
            }
            if (riderId !== '0' && !member.roles.cache.has(riderId)) {
                await member.roles.add(riderId);
            }
        }
        catch (err) {
            console.error('[Verify] Role swap failed:', err);
            throw err;
        }
    }
}
exports.MemberVerifyService = MemberVerifyService;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
