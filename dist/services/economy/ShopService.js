"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopService = exports.ShopPurchaseError = void 0;
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../../lib/prisma");
const wallet_1 = require("../../lib/wallet");
const config_1 = require("../../config");
class ShopPurchaseError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'ShopPurchaseError';
    }
}
exports.ShopPurchaseError = ShopPurchaseError;
class ShopService {
    constructor(repo, redemption, logging) {
        this.repo = repo;
        this.redemption = redemption;
        this.logging = logging;
    }
    listItems(guildId) {
        return this.repo.listEnabled(guildId);
    }
    listAll(guildId) {
        return this.repo.listAll(guildId);
    }
    upsertItem(item) {
        return this.repo.upsert(item);
    }
    removeItem(guildId, key) {
        return this.repo.remove(guildId, key);
    }
    async ensureDefaults(guildId) {
        await this.repo.ensureDefaults(guildId, config_1.config.economy.defaultShopItems);
    }
    async purchase(guildId, userId, itemKey, shopEnabled) {
        if (!shopEnabled)
            throw new ShopPurchaseError('SHOP_DISABLED');
        const item = await this.repo.findByKey(guildId, itemKey);
        if (!item || !item.enabled)
            throw new ShopPurchaseError('ITEM_NOT_FOUND');
        let redemption;
        try {
            redemption = await prisma_1.prisma.$transaction(async (tx) => {
                await (0, wallet_1.adjustBalance)(tx, userId, new decimal_js_1.default(-item.priceRc), 'shop_purchase', `Shop: ${item.label}`);
                const code = this.redemption.generateCode();
                return tx.redemption.create({
                    data: {
                        guildId,
                        userId,
                        rewardKey: item.rewardKey,
                        code,
                        source: client_1.RedemptionSource.SHOP,
                        costRc: new decimal_js_1.default(item.priceRc),
                    },
                });
            });
        }
        catch (err) {
            if (err instanceof wallet_1.InsufficientFundsError)
                throw new ShopPurchaseError('INSUFFICIENT_FUNDS');
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
exports.ShopService = ShopService;
