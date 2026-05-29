import { Guild, Invite } from 'discord.js';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { EconomyService } from './EconomyService';
import { LoggerService } from './LoggerService';
import { UserService } from './UserService';
import type { Snowflake } from '../types';

export class InviteService {
  private inviteCache = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly economy: EconomyService,
    private readonly user: UserService,
    private readonly logger: LoggerService
  ) {}

  async syncGuildInvites(guild: Guild): Promise<void> {
    const invites = await guild.invites.fetch();
    for (const [, invite] of invites) {
      if (!invite.code || !invite.inviter) continue;
      await this.pool.query(
        `INSERT INTO server_invite_codes (code, inviter_user_id, uses_count_at_detection, last_checked_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (code) DO UPDATE SET uses_count_at_detection = $3, last_checked_at = NOW()`,
        [invite.code, invite.inviter.id, invite.uses ?? 0]
      );
      this.inviteCache.set(invite.code, invite.uses ?? 0);
    }
  }

  async detectInviteUsed(guild: Guild): Promise<{ code: string; inviterId: string } | null> {
    const before = new Map(this.inviteCache);
    const invites = await guild.invites.fetch();

    for (const [, invite] of invites) {
      if (!invite.code) continue;
      const prevUses = before.get(invite.code) ?? invite.uses ?? 0;
      const currentUses = invite.uses ?? 0;

      if (currentUses > prevUses && invite.inviter) {
        await this.pool.query(
          `INSERT INTO server_invite_codes (code, inviter_user_id, uses_count_at_detection, last_checked_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (code) DO UPDATE SET uses_count_at_detection = $3, last_checked_at = NOW()`,
          [invite.code, invite.inviter.id, currentUses]
        );
        this.inviteCache.set(invite.code, currentUses);
        return { code: invite.code, inviterId: invite.inviter.id };
      }
      this.inviteCache.set(invite.code, currentUses);
    }
    return null;
  }

  async trackPendingInvite(
    invitedUserId: Snowflake,
    inviterUserId: Snowflake,
    inviteCode: string
  ): Promise<void> {
    await this.user.ensureUser(invitedUserId);
    await this.user.ensureUser(inviterUserId);

    if (invitedUserId === inviterUserId) {
      throw new Error('Self-invite not allowed');
    }

    const recentDup = await this.pool.query(
      `SELECT 1 FROM invite_tracking
       WHERE invited_user_id = $1 OR (inviter_user_id = $2 AND joined_at > NOW() - INTERVAL '1 hour')`,
      [invitedUserId, inviterUserId]
    );

    if ((recentDup.rowCount ?? 0) > 0) {
      this.logger.warn('Duplicate invite pattern detected', { userId: invitedUserId });
    }

    await this.pool.query(
      `INSERT INTO invite_tracking (invited_user_id, inviter_user_id, invite_code_used, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (invited_user_id) DO NOTHING`,
      [invitedUserId, inviterUserId, inviteCode]
    );

    await this.economy.recordSystemTransaction(invitedUserId, 'Invite Detected (Pending)', {
      inviterUserId,
      inviteCode,
    });
  }

  async validatePendingInvites(guild: Guild): Promise<void> {
    const pending = await this.pool.query<{
      id: string;
      invited_user_id: string;
      inviter_user_id: string;
      joined_at: Date;
    }>(`SELECT id, invited_user_id, inviter_user_id, joined_at FROM invite_tracking WHERE status = 'pending'`);

    for (const row of pending.rows) {
      try {
        const reason = await this.validateInvite(guild, row);
        if (reason === null) {
          await this.markValid(row.id, row.inviter_user_id, guild);
        } else {
          await this.pool.query(
            `UPDATE invite_tracking SET status = 'invalid', validated_at = NOW(), validation_reason = $2 WHERE id = $1`,
            [row.id, reason]
          );
        }
      } catch (err) {
        this.logger.error('Invite validation error', {
          userId: row.invited_user_id,
          commandName: 'inviteValidator',
        });
      }
    }
  }

  private async validateInvite(
    guild: Guild,
    row: { invited_user_id: string; inviter_user_id: string; joined_at: Date }
  ): Promise<string | null> {
    let member;
    try {
      member = await guild.members.fetch(row.invited_user_id);
    } catch {
      return 'User left the server';
    }

    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const minAccountAgeMs = config.invite.minAccountAgeDays * 24 * 60 * 60 * 1000;
    if (accountAgeMs < minAccountAgeMs) {
      return `Account younger than ${config.invite.minAccountAgeDays} days`;
    }

    const stayMs = Date.now() - new Date(row.joined_at).getTime();
    const minStayMs = config.invite.minStayDays * 24 * 60 * 60 * 1000;
    if (stayMs < minStayMs) {
      return `Has not stayed ${config.invite.minStayDays} days yet`;
    }

    const activity = await this.user.getActivity(row.invited_user_id);
    if (
      activity.messageCount < config.invite.minMessages &&
      activity.vcMinutes < config.invite.minVcMinutes
    ) {
      return `Insufficient activity (${activity.messageCount} msgs, ${activity.vcMinutes} vc mins)`;
    }

    const velocity = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM invite_tracking
       WHERE inviter_user_id = $1 AND joined_at > NOW() - INTERVAL '24 hours'`,
      [row.inviter_user_id]
    );
    if ((velocity.rows[0]?.cnt ?? 0) > 20) {
      return 'Inviter velocity too high (possible abuse)';
    }

    return null;
  }

  private async markValid(
    trackingId: string,
    inviterUserId: Snowflake,
    guild: Guild
  ): Promise<void> {
    const reward = new Decimal(config.invite.reward);
    const txId = await this.economy.addBalance(
      inviterUserId,
      reward,
      'Valid Invite',
      'invite'
    );

    await this.pool.query(
      `UPDATE invite_tracking SET status = 'valid', validated_at = NOW(), reward_transaction_id = $2 WHERE id = $1`,
      [trackingId, txId]
    );

    await this.checkMilestones(inviterUserId, guild);
  }

  private async checkMilestones(inviterUserId: Snowflake, guild: Guild): Promise<void> {
    const countResult = await this.pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM invite_tracking WHERE inviter_user_id = $1 AND status = 'valid'`,
      [inviterUserId]
    );
    const validCount = parseInt(countResult.rows[0].cnt, 10);

    for (const tier of config.invite.milestoneTiers) {
      if (validCount < tier) continue;

      const awarded = await this.pool.query(
        'SELECT 1 FROM invite_milestones_awarded WHERE user_id = $1 AND milestone_tier = $2',
        [inviterUserId, tier]
      );
      if ((awarded.rowCount ?? 0) > 0) continue;

      const bonus =
        config.invite.milestones[tier as keyof typeof config.invite.milestones];
      const txId = await this.economy.addBalance(
        inviterUserId,
        new Decimal(bonus),
        `Invite Milestone: ${tier} valid invites`,
        'invite',
        undefined,
        { milestoneTier: tier }
      );

      await this.pool.query(
        'INSERT INTO invite_milestones_awarded (user_id, milestone_tier, transaction_id) VALUES ($1, $2, $3)',
        [inviterUserId, tier, txId]
      );

      if (tier === 50 && config.roles.eliteInviter !== '0') {
        await this.user.addRole(
          guild.client,
          guild.id,
          inviterUserId,
          config.roles.eliteInviter
        );
      }
      if (tier === 100 && config.roles.legendDriver !== '0') {
        await this.user.addRole(
          guild.client,
          guild.id,
          inviterUserId,
          config.roles.legendDriver
        );
      }
    }
  }
}
