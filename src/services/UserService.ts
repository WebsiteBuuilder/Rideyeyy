import { Client, Guild, GuildMember } from 'discord.js';
import { Pool } from 'pg';
import { config } from '../config';
import { LoggerService } from './LoggerService';
import { EconomyService } from './EconomyService';
import { NICKNAME_MAX_LENGTH } from '../utils/constants';
import type { Snowflake } from '../types';

export class UserService {
  constructor(
    private readonly pool: Pool,
    private readonly logger: LoggerService,
    private readonly economy: EconomyService
  ) {}

  async ensureUser(userId: Snowflake): Promise<void> {
    await this.pool.query(
      'INSERT INTO user_balances (user_id, balance) VALUES ($1, 0.00) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    await this.pool.query(
      'INSERT INTO user_activity (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
  }

  async getMember(guild: Guild, userId: Snowflake): Promise<GuildMember | null> {
    try {
      return await guild.members.fetch(userId);
    } catch {
      return null;
    }
  }

  async setNickname(
    client: Client,
    guildId: Snowflake,
    userId: Snowflake,
    nickname: string
  ): Promise<string> {
    const guild = await client.guilds.fetch(guildId);
    const member = await this.getMember(guild, userId);
    if (!member) {
      throw new Error('Member not found');
    }
    const trimmed = nickname.slice(0, NICKNAME_MAX_LENGTH);
    await member.setNickname(trimmed);
    return trimmed;
  }

  async addRole(client: Client, guildId: Snowflake, userId: Snowflake, roleId: Snowflake): Promise<void> {
    if (roleId === '0') return;
    const guild = await client.guilds.fetch(guildId);
    const member = await this.getMember(guild, userId);
    if (!member) return;
    await member.roles.add(roleId);
  }

  async removeRole(
    client: Client,
    guildId: Snowflake,
    userId: Snowflake,
    roleId: Snowflake
  ): Promise<void> {
    if (roleId === '0') return;
    const guild = await client.guilds.fetch(guildId);
    const member = await this.getMember(guild, userId);
    if (!member) return;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
    }
  }

  async incrementMessageCount(userId: Snowflake): Promise<void> {
    await this.ensureUser(userId);
    await this.pool.query(
      `UPDATE user_activity
       SET message_count = message_count + 1, last_message_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }

  async addVcMinutes(userId: Snowflake, minutes: number): Promise<void> {
    await this.ensureUser(userId);
    await this.pool.query(
      `UPDATE user_activity
       SET vc_minutes = vc_minutes + $2, last_vc_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId, minutes]
    );
  }

  async getInventory(userId: Snowflake): Promise<
    Array<{ item_type: string; quantity: number; item_metadata: Record<string, unknown> | null; acquired_at: Date }>
  > {
    const result = await this.pool.query<{
      item_type: string;
      quantity: number;
      item_metadata: Record<string, unknown> | null;
      acquired_at: Date;
    }>(
      `SELECT item_type, quantity, item_metadata, acquired_at
       FROM user_inventory WHERE user_id = $1 ORDER BY acquired_at DESC LIMIT 50`,
      [userId]
    );
    return result.rows;
  }

  async getActivity(userId: Snowflake): Promise<{ messageCount: number; vcMinutes: number }> {
    const result = await this.pool.query<{ message_count: number; vc_minutes: number }>(
      'SELECT message_count, vc_minutes FROM user_activity WHERE user_id = $1',
      [userId]
    );
    if (result.rowCount === 0) {
      return { messageCount: 0, vcMinutes: 0 };
    }
    return {
      messageCount: result.rows[0].message_count,
      vcMinutes: result.rows[0].vc_minutes,
    };
  }

  buildTaggedNickname(baseName: string, tag: string): { tagged: string; truncated: boolean } {
    const separator = ' ';
    const fullTag = tag.startsWith('|') ? tag : `| ${tag}`;
    const maxBase = NICKNAME_MAX_LENGTH - fullTag.length - (baseName.length > 0 ? separator.length : 0);
    let truncated = false;
    let namePart = baseName || 'User';
    if (namePart.length + fullTag.length + separator.length > NICKNAME_MAX_LENGTH) {
      truncated = true;
      namePart = namePart.slice(0, Math.max(1, maxBase)).trimEnd();
      if (namePart.endsWith('...') === false && namePart.length < baseName.length) {
        namePart = namePart.slice(0, Math.max(1, namePart.length - 3)) + '...';
      }
    }
    const tagged = namePart ? `${namePart}${separator}${fullTag.trim()}` : fullTag.trim();
    return { tagged: tagged.slice(0, NICKNAME_MAX_LENGTH), truncated };
  }

  getDisplayName(member: GuildMember): string {
    return member.nickname ?? member.user.displayName ?? member.user.username;
  }
}
