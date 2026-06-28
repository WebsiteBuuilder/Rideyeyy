"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedemptionService = void 0;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const config_1 = require("../../config");
// ═══════════════════════════════════════════════════════════════════════════
//  RedemptionService — rewards wallet (shop, lottery, milestones).
//  Users apply rewards during /book; staff can still redeem legacy codes.
// ═══════════════════════════════════════════════════════════════════════════
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;
const SOURCE_LABEL = {
    SHOP: 'shop',
    MILESTONE: 'milestone',
    LOTTERY: 'lottery',
    MANUAL: 'staff',
};
class RedemptionService {
    constructor(repo, logging) {
        this.repo = repo;
        this.logging = logging;
    }
    label(rewardKey) {
        return config_1.config.economy.rewardLabels[rewardKey] ?? rewardKey;
    }
    sourceLabel(source) {
        return SOURCE_LABEL[source] ?? source.toLowerCase();
    }
    /** Legacy code generator — only used when explicitly requested. */
    generateCode() {
        const groups = [];
        for (let g = 0; g < CODE_GROUPS; g++) {
            const bytes = (0, crypto_1.randomBytes)(CODE_GROUP_LEN);
            let s = '';
            for (let i = 0; i < CODE_GROUP_LEN; i++) {
                s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
            }
            groups.push(s);
        }
        return `GR-${groups.join('-')}`;
    }
    formatRewardLine(r) {
        return `**${this.label(r.rewardKey)}** _(${this.sourceLabel(r.source)})_`;
    }
    async issue(params, db) {
        const redemption = await this.repo.create({
            guildId: params.guildId,
            userId: params.userId,
            rewardKey: params.rewardKey,
            code: null,
            source: params.source,
            costRc: params.costRc ?? null,
        }, db);
        await this.logging.log({
            guildId: params.guildId,
            event: 'REDEMPTION_ISSUED',
            actorId: params.userId,
            detail: `${this.label(params.rewardKey)} (${params.source})`,
        });
        return redemption;
    }
    listAvailable(guildId, userId) {
        return this.repo.listAvailable(guildId, userId);
    }
    async reserveForBooking(redemptionId, bookingId, userId, db) {
        const ok = await this.repo.reserve(redemptionId, userId, bookingId, db);
        if (ok) {
            const row = await this.repo.findById(redemptionId, db);
            if (row) {
                await this.logging.log({
                    guildId: row.guildId,
                    event: 'REDEMPTION_RESERVED',
                    actorId: userId,
                    detail: `${this.label(row.rewardKey)} → booking ${bookingId}`,
                });
            }
        }
        return ok;
    }
    async releaseForBooking(bookingId) {
        const row = await this.repo.findByBookingId(bookingId);
        if (!row)
            return false;
        const ok = await this.repo.releaseByBooking(bookingId);
        if (ok) {
            await this.logging.log({
                guildId: row.guildId,
                event: 'REDEMPTION_RELEASED',
                targetUserId: row.userId,
                detail: `${this.label(row.rewardKey)} released (booking cancelled)`,
            });
        }
        return ok;
    }
    async finalizeForBooking(bookingId, staffId) {
        const row = await this.repo.findByBookingId(bookingId);
        if (!row)
            return false;
        const ok = await this.repo.finalizeByBooking(bookingId, staffId ?? null);
        if (ok) {
            await this.logging.log({
                guildId: row.guildId,
                event: 'REDEMPTION_USED',
                actorId: staffId ?? undefined,
                targetUserId: row.userId,
                detail: `${this.label(row.rewardKey)} honored on booking ${bookingId}`,
            });
        }
        return ok;
    }
    async redeemById(guildId, id, staffId) {
        const existing = await this.repo.findById(id);
        if (!existing)
            return { ok: false, reason: 'NOT_FOUND' };
        if (existing.guildId !== guildId)
            return { ok: false, reason: 'WRONG_GUILD' };
        if (existing.status !== client_1.RedemptionStatus.ACTIVE) {
            return { ok: false, reason: 'ALREADY_USED', redemption: existing };
        }
        const done = await this.repo.markRedeemedById(id, guildId, staffId);
        if (!done)
            return { ok: false, reason: 'ALREADY_USED', redemption: existing };
        await this.logging.log({
            guildId,
            event: 'REDEMPTION_USED',
            actorId: staffId,
            targetUserId: existing.userId,
            detail: `${this.label(existing.rewardKey)} (manual)`,
        });
        return { ok: true, redemption: existing };
    }
    async redeem(guildId, code, staffId) {
        const normalized = code.trim().toUpperCase();
        const existing = await this.repo.findByCode(normalized);
        if (!existing)
            return { ok: false, reason: 'NOT_FOUND' };
        if (existing.guildId !== guildId)
            return { ok: false, reason: 'WRONG_GUILD' };
        if (existing.status !== client_1.RedemptionStatus.ACTIVE) {
            return { ok: false, reason: 'ALREADY_USED', redemption: existing };
        }
        const done = await this.repo.markRedeemedByCode(normalized, staffId);
        if (!done)
            return { ok: false, reason: 'ALREADY_USED', redemption: existing };
        await this.logging.log({
            guildId,
            event: 'REDEMPTION_USED',
            actorId: staffId,
            targetUserId: existing.userId,
            detail: `${this.label(existing.rewardKey)} → legacy code`,
        });
        return { ok: true, redemption: existing };
    }
    listForUser(guildId, userId, status) {
        return this.repo.listForUser(guildId, userId, status);
    }
    findById(id) {
        return this.repo.findById(id);
    }
}
exports.RedemptionService = RedemptionService;
