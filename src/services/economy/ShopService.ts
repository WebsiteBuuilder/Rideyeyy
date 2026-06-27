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

  upsertItem(item: { guildId: string; key: string; label: string; priceRc: number; rewardKey: string; sortOrder?: number; enabled?: boolean }): Promise<ShopItem> {
    return this.repo.upsert(item);
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
        const code = this.redemption.generateCode();
        return tx.redemption.create({
          data: {
            guildId,
            userId,
            rewardKey: item.rewardKey,
            code,
            source: RedemptionSource.SHOP,
            costRc: new Decimal(item.priceRc),
          },
        });
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) throw new ShopPurchaseError('INSUFFICIENT_FUNDS');
      throw err;
    }

    await this.logging.log({
      guildId,
      event: 'SHOP_PURCHASE',
      actorId: userId,
      detail: `${item.label} (-${item.priceRc} RC) → \`${redemption.code}\``,
    });
    return { item, redemption };
  }
}
