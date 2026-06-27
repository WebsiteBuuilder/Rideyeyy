import { prisma } from '../lib/prisma';
import { ensureWallet } from '../lib/wallet';
import type { IUserService, ActivityRow, InventoryRow } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  USER SERVICE — backed by user_balances / user_activity / user_inventory
// ═══════════════════════════════════════════════════════════════════════════

export class UserService implements IUserService {
  async ensureUser(userId: string): Promise<void> {
    await ensureWallet(userId);
  }

  async getActivity(userId: string): Promise<ActivityRow> {
    const rows = await prisma.$queryRaw<{ message_count: number; vc_minutes: number }[]>`
      SELECT message_count, vc_minutes FROM user_activity WHERE user_id = ${userId}::bigint
    `;
    return {
      messageCount: rows[0]?.message_count ?? 0,
      vcMinutes: rows[0]?.vc_minutes ?? 0,
    };
  }

  async getInventory(userId: string): Promise<InventoryRow[]> {
    const rows = await prisma.$queryRaw<InventoryRow[]>`
      SELECT item_type, quantity, item_metadata
      FROM user_inventory
      WHERE user_id = ${userId}::bigint
      ORDER BY created_at DESC
    `;
    return rows;
  }
}
