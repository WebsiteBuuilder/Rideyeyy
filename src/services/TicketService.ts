import {
  ChannelType,
  Client,
  Guild,
  GuildMember,
  OverwriteType,
  PermissionFlagsBits,
} from 'discord.js';
import { Pool } from 'pg';
import { config } from '../config';
import { LoggerService } from './LoggerService';
import { UserService } from './UserService';
import type { Snowflake } from '../types';

export class TicketService {
  constructor(
    private readonly pool: Pool,
    private readonly user: UserService,
    private readonly logger: LoggerService
  ) {}

  async createBookingTicket(
    client: Client,
    guild: Guild,
    member: GuildMember
  ): Promise<{ ticketId: string; channelId: string }> {
    await this.user.ensureUser(member.id);

    const openTickets = await this.pool.query(
      `SELECT ticket_id FROM tickets WHERE user_id = $1 AND status = 'open'`,
      [member.id]
    );
    if ((openTickets.rowCount ?? 0) > 0) {
      throw new Error('You already have an open booking ticket');
    }

    const ticketInsert = await this.pool.query<{ ticket_id: string }>(
      `INSERT INTO tickets (user_id, channel_id, status, metadata)
       VALUES ($1, 0, 'open', '{}') RETURNING ticket_id`,
      [member.id]
    );
    const ticketId = ticketInsert.rows[0].ticket_id;

    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];

    if (config.roles.staff !== '0') {
      overwrites.push({
        id: config.roles.staff,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
    if (config.roles.admin !== '0') {
      overwrites.push({
        id: config.roles.admin,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    const channel = await guild.channels.create({
      name: `book-${member.user.username}`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: config.channels.ticketCategory !== '0' ? config.channels.ticketCategory : undefined,
      topic: `Ticket ID: ${ticketId}`,
      permissionOverwrites: overwrites.map((o) => ({
        id: o.id,
        allow: 'allow' in o ? o.allow : [],
        deny: 'deny' in o ? o.deny : [],
        type: o.id === member.id || o.id === client.user!.id ? OverwriteType.Member : OverwriteType.Role,
      })),
    });

    await this.pool.query('UPDATE tickets SET channel_id = $1 WHERE ticket_id = $2', [
      channel.id,
      ticketId,
    ]);

    await channel.send({
      embeds: [
        {
          title: 'Ride Booking Ticket',
          description: `Welcome ${member}! Please provide:\n- Pickup location\n- Drop-off location\n- Preferred date/time\n- Number of passengers\n\nStaff will assist you shortly.`,
          color: 0x5865f2,
          footer: { text: `Ticket: ${ticketId}` },
        },
      ],
    });

    this.logger.info('Booking ticket created', { userId: member.id, transactionId: ticketId });
    return { ticketId, channelId: channel.id };
  }

  async getTicketByChannel(channelId: Snowflake) {
    const result = await this.pool.query('SELECT * FROM tickets WHERE channel_id = $1', [channelId]);
    return result.rows[0] ?? null;
  }

  async closeTicket(channelId: Snowflake, reason?: string): Promise<void> {
    const ticket = await this.getTicketByChannel(channelId);
    if (!ticket) throw new Error('Ticket not found');

    const metadata = { ...(ticket.metadata ?? {}), closeReason: reason };
    await this.pool.query(
      `UPDATE tickets SET status = 'closed', closed_at = NOW(), metadata = $2 WHERE channel_id = $1`,
      [channelId, JSON.stringify(metadata)]
    );
  }

  async assignTicket(channelId: Snowflake, staffId: Snowflake): Promise<void> {
    await this.pool.query(
      'UPDATE tickets SET assigned_staff_id = $2, status = $3 WHERE channel_id = $1',
      [channelId, staffId, 'in_progress']
    );
  }

  async addNote(channelId: Snowflake, note: string): Promise<void> {
    const ticket = await this.getTicketByChannel(channelId);
    if (!ticket) throw new Error('Ticket not found');
    const metadata = { ...(ticket.metadata ?? {}), notes: [...(ticket.metadata?.notes ?? []), note] };
    await this.pool.query('UPDATE tickets SET metadata = $2 WHERE channel_id = $1', [
      channelId,
      JSON.stringify(metadata),
    ]);
  }

  async reopenTicket(channelId: Snowflake): Promise<void> {
    await this.pool.query(
      `UPDATE tickets SET status = 'open', closed_at = NULL WHERE channel_id = $1`,
      [channelId]
    );
  }
}
