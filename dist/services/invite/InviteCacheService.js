"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteCacheService = void 0;
const prisma_1 = require("../../lib/prisma");
const VANITY_PREFIX = 'vanity:';
class InviteCacheService {
    constructor() {
        this.cache = new Map();
    }
    async primeAll(client) {
        for (const guild of client.guilds.cache.values()) {
            await this.prime(guild);
        }
    }
    async prime(guild) {
        const map = await this.fetchSnapshot(guild);
        if (map) {
            this.cache.set(guild.id, map);
            void this.mirror(guild.id, map);
        }
    }
    clear(guildId) {
        this.cache.delete(guildId);
    }
    onCreate(invite) {
        if (!invite.guild)
            return;
        const guildId = invite.guild.id;
        const map = this.cache.get(guildId) ?? new Map();
        map.set(invite.code, {
            uses: invite.uses ?? 0,
            inviterId: invite.inviter?.id ?? null,
            isVanity: false,
        });
        this.cache.set(guildId, map);
        void prisma_1.prisma.inviteCode
            .upsert({
            where: { guildId_code: { guildId, code: invite.code } },
            create: { guildId, code: invite.code, inviterId: invite.inviter?.id ?? null, uses: invite.uses ?? 0 },
            update: { inviterId: invite.inviter?.id ?? null, uses: invite.uses ?? 0 },
        })
            .catch(() => { });
    }
    onDelete(invite) {
        if (!invite.guild)
            return;
        const map = this.cache.get(invite.guild.id);
        if (map)
            map.delete(invite.code);
    }
    /**
     * Compare the live invite counts to the cached snapshot and return the invite
     * whose use count increased (or the single-use invite that disappeared).
     * Always refreshes the cache afterwards.
     */
    async resolveOnJoin(guild) {
        const cached = this.cache.get(guild.id) ?? new Map();
        const fresh = await this.fetchSnapshot(guild);
        if (!fresh)
            return null;
        let resolved = null;
        for (const [code, info] of fresh) {
            if (code.startsWith(VANITY_PREFIX))
                continue;
            const prev = cached.get(code)?.uses ?? 0;
            if (info.uses > prev) {
                resolved = { code, inviterId: info.inviterId, isVanity: false };
                break;
            }
        }
        // A single-use invite is deleted by Discord the moment it is consumed, so it
        // will be missing from the fresh snapshot. Treat a vanished cached invite as
        // the one that was used.
        if (!resolved) {
            for (const [code, info] of cached) {
                if (code.startsWith(VANITY_PREFIX))
                    continue;
                if (!fresh.has(code)) {
                    resolved = { code, inviterId: info.inviterId, isVanity: false };
                    break;
                }
            }
        }
        // Vanity URL fallback.
        if (!resolved) {
            const vanityKey = `${VANITY_PREFIX}${guild.vanityURLCode ?? ''}`;
            const prevV = cached.get(vanityKey)?.uses ?? 0;
            const nowV = fresh.get(vanityKey)?.uses ?? 0;
            if (guild.vanityURLCode && nowV > prevV) {
                resolved = { code: guild.vanityURLCode, inviterId: null, isVanity: true };
            }
        }
        this.cache.set(guild.id, fresh);
        if (resolved && !resolved.isVanity) {
            const used = fresh.get(resolved.code);
            if (used) {
                void prisma_1.prisma.inviteCode
                    .upsert({
                    where: { guildId_code: { guildId: guild.id, code: resolved.code } },
                    create: { guildId: guild.id, code: resolved.code, inviterId: used.inviterId, uses: used.uses },
                    update: { inviterId: used.inviterId, uses: used.uses },
                })
                    .catch(() => { });
            }
        }
        return resolved;
    }
    async fetchSnapshot(guild) {
        let invites;
        try {
            invites = await guild.invites.fetch();
        }
        catch (err) {
            console.warn(`[Invite] Could not fetch invites for guild ${guild.id} (missing Manage Server?):`, err.message);
            return null;
        }
        const map = new Map();
        for (const inv of invites.values()) {
            map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id ?? null, isVanity: false });
        }
        if (guild.vanityURLCode) {
            try {
                const vanity = await guild.fetchVanityData();
                map.set(`${VANITY_PREFIX}${guild.vanityURLCode}`, {
                    uses: vanity.uses ?? 0,
                    inviterId: null,
                    isVanity: true,
                });
            }
            catch {
                /* vanity data needs Manage Server; ignore if unavailable */
            }
        }
        return map;
    }
    async mirror(guildId, map) {
        for (const [code, info] of map) {
            if (code.startsWith(VANITY_PREFIX))
                continue;
            try {
                await prisma_1.prisma.inviteCode.upsert({
                    where: { guildId_code: { guildId, code } },
                    create: { guildId, code, inviterId: info.inviterId, uses: info.uses },
                    update: { inviterId: info.inviterId, uses: info.uses },
                });
            }
            catch {
                /* mirror best-effort */
            }
        }
    }
}
exports.InviteCacheService = InviteCacheService;
