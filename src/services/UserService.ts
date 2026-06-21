import type { IUserService, ActivityRow, InventoryRow } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  USER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class UserService implements IUserService {
  async ensureUser(userId: string): Promise<void> {
    void userId;
  }

  async getActivity(userId: string): Promise<ActivityRow> {
    void userId;
    return { messageCount: 0, vcMinutes: 0 };
  }

  async getInventory(userId: string): Promise<InventoryRow[]> {
    void userId;
    return [];
  }
}
