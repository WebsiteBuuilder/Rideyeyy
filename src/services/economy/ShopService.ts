import { Redemption, RedemptionSource, ShopItem } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { adjustBalance, InsufficientFundsError } from '../../lib/wallet';
import { config } from '../../config';
import { InviteLoggingService } from '../invite/InviteLoggingService';
import { ShopRepository } from './repositories';
import { RedemptionService } from './RedemptionService';

// ═══════════════════════════════════════════════════════════════════════════
//  ShopService — spends RouteCash to issue redemption codes. The balance debit
//  and the code insert happen in one transaction, so a failure rolls back both.
// ═══════════════════════════════════════════════════════════════════════════

export type PurchaseError = 'SHOP_DISABLED' | 'ITEM_NOT_FOUND' | 'INSUFFICIENT_FUNDS';

export class ShopPurchaseError extends Error {
  constructor(public readonly code: PurchaseError) {
    super(code);
    this.name = 'ShopPurchaseError';
  }
}

export class ShopService {
  constructor(
    private readonly repo: ShopRepository,
    private readonly redemption: RedemptionService,
    private readonly logging: InviteLoggingService
  ) {}

  listItems(guildId: string): Promise<ShopItem[]> {
    return this.repo.listEnabled(guildId);
  }

  listAll(guildId: string): Promise<ShopItem[]> {
    return this.repo.listAll(guildId);
  }

  upsertItem(item: {
    guildId: string;
    key: string;
    label: string;
    description?: string | null;
    priceRc: number;
    rewardKey: string;
    sortOrder?: number;
    enabled?: boolean;
  }): Promise<ShopItem> {
    return this.repo.upsert(item);
  }

  toggleItem(guildId: string, key: string): Promise<ShopItem | null> {
    return this.repo.toggleEnabled(guildId, key);
  }

  async moveItem(guildId: string, key: string, direction: -1 | 1): Promise<boolean> {
    const items = await this.repo.listAll(guildId);
    const idx = items.findIndex((i) => i.key === key);
    if (idx < 0) return false;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return false;
    const a = items[idx];
    const b = items[swapIdx];
    await prisma.$transaction([
      prisma.shopItem.update({
        where: { guildId_key: { guildId, key: a.key } },
        data: { sortOrder: b.sortOrder },
      }),
      prisma.shopItem.update({
        where: { guildId_key: { guildId, key: b.key } },
        data: { sortOrder: a.sortOrder },
      }),
    ]);
    return true;
  }

  removeItem(guildId: string, key: string): Promise<boolean> {
    return this.repo.remove(guildId, key);
  }

  async ensureDefaults(guildId: string): Promise<void> {
    await this.repo.ensureDefaults(guildId, config.economy.defaultShopItems);
  }

  async purchase(guildId: string, userId: string, itemKey: string, shopEnabled: boolean): Promise<{ item: ShopItem; redemption: Redemption }> {
    if (!shopEnabled) throw new ShopPurchaseError('SHOP_DISABLED');

    const item = await this.repo.findByKey(guildId, itemKey);
    if (!item || !item.enabled) throw new ShopPurchaseError('ITEM_NOT_FOUND');

    let redemption: Redemption;
    try {
      redemption = await prisma.$transaction(async (tx) => {
        await adjustBalance(tx, userId, new Decimal(-item.priceRc), 'shop_purchase', `Shop: ${item.label}`);
        return this.redemption.issue(
          {
            guildId,
            userId,
            rewardKey: item.rewardKey,
            source: RedemptionSource.SHOP,
            costRc: item.priceRc,
          },
          tx
        );
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) throw new ShopPurchaseError('INSUFFICIENT_FUNDS');
      throw err;
    }

    await this.logging.log({
      guildId,
      event: 'SHOP_PURCHASE',
      actorId: userId,
      detail: `${item.label} (-${item.priceRc} RC) → ${this.redemption.label(item.rewardKey)}`,
    });
    return { item, redemption };
  }
}
