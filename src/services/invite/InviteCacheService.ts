import { Client, Collection, Guild, Invite } from 'discord.js';
import { prisma } from '../../lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteCacheService — keeps an in-memory snapshot of every guild invite's
//  use count so a member join can be attributed to the invite that increased.
//  Handles vanity URLs and single-use invites that Discord auto-deletes on use.
// ═══════════════════════════════════════════════════════════════════════════

interface CachedInvite {
  uses: number;
  inviterId: string | null;
  isVanity: boolean;
}

export interface ResolvedInvite {
  code: string;
  inviterId: string | null;
  isVanity: boolean;
}

const VANITY_PREFIX = 'vanity:';

export class InviteCacheService {
  private readonly cache = new Map<string, Map<string, CachedInvite>>();

  async primeAll(client: Client): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
      await this.prime(guild);
    }
  }

  async prime(guild: Guild): Promise<void> {
    const map = await this.fetchSnapshot(guild);
    if (map) {
      this.cache.set(guild.id, map);
      void this.mirror(guild.id, map);
    }
  }

  clear(guildId: string): void {
    this.cache.delete(guildId);
  }

  onCreate(invite: Invite): void {
    if (!invite.guild) return;
    const guildId = invite.guild.id;
    const map = this.cache.get(guildId) ?? new Map<string, CachedInvite>();
    map.set(invite.code, {
      uses: invite.uses ?? 0,
      inviterId: invite.inviter?.id ?? null,
      isVanity: false,
    });
    this.cache.set(guildId, map);
    void prisma.inviteCode
      .upsert({
        where: { guildId_code: { guildId, code: invite.code } },
        create: { guildId, code: invite.code, inviterId: invite.inviter?.id ?? null, uses: invite.uses ?? 0 },
        update: { inviterId: invite.inviter?.id ?? null, uses: invite.uses ?? 0 },
      })
      .catch(() => { /* mirror best-effort */ });
  }

  onDelete(invite: Invite): void {
    if (!invite.guild) return;
    const map = this.cache.get(invite.guild.id);
    if (map) map.delete(invite.code);
  }

  /**
   * Compare the live invite counts to the cached snapshot and return the invite
   * whose use count increased (or the single-use invite that disappeared).
   * Always refreshes the cache afterwards.
   */
  async resolveOnJoin(guild: Guild): Promise<ResolvedInvite | null> {
    const cached = this.cache.get(guild.id) ?? new Map<string, CachedInvite>();
    const fresh = await this.fetchSnapshot(guild);
    if (!fresh) return null;

    let resolved: ResolvedInvite | null = null;

    for (const [code, info] of fresh) {
      if (code.startsWith(VANITY_PREFIX)) continue;
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
        if (code.startsWith(VANITY_PREFIX)) continue;
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
        void prisma.inviteCode
          .upsert({
            where: { guildId_code: { guildId: guild.id, code: resolved.code } },
            create: { guildId: guild.id, code: resolved.code, inviterId: used.inviterId, uses: used.uses },
            update: { inviterId: used.inviterId, uses: used.uses },
          })
          .catch(() => { /* mirror best-effort */ });
      }
    }
    return resolved;
  }

  private async fetchSnapshot(guild: Guild): Promise<Map<string, CachedInvite> | null> {
    let invites: Collection<string, Invite>;
    try {
      invites = await guild.invites.fetch();
    } catch (err) {
      console.warn(`[Invite] Could not fetch invites for guild ${guild.id} (missing Manage Server?):`, (err as Error).message);
      return null;
    }
    const map = new Map<string, CachedInvite>();
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
      } catch {
        /* vanity data needs Manage Server; ignore if unavailable */
      }
    }
    return map;
  }

  private async mirror(guildId: string, map: Map<string, CachedInvite>): Promise<void> {
    for (const [code, info] of map) {
      if (code.startsWith(VANITY_PREFIX)) continue;
      try {
        await prisma.inviteCode.upsert({
          where: { guildId_code: { guildId, code } },
          create: { guildId, code, inviterId: info.inviterId, uses: info.uses },
          update: { inviterId: info.inviterId, uses: info.uses },
        });
      } catch {
        /* mirror best-effort */
      }
    }
  }
}
