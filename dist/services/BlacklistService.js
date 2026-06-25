"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlacklistService = void 0;
const prisma_1 = require("../lib/prisma");
// ═══════════════════════════════════════════════════════════════════════════
//  BLACKLIST SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class BlacklistService {
    async isBlacklisted(discordId) {
        const entry = await prisma_1.prisma.blacklist.findUnique({ where: { discordId } });
        return entry !== null;
    }
    async add(discordId, createdBy, reason) {
        await prisma_1.prisma.blacklist.upsert({
            where: { discordId },
            create: { discordId, createdBy, reason: reason ?? null },
            update: { reason: reason ?? null, createdBy },
        });
        console.log(`[Bot] Blacklist Added: ${discordId} by ${createdBy}`);
    }
    async remove(discordId) {
        try {
            await prisma_1.prisma.blacklist.delete({ where: { discordId } });
            console.log(`[Bot] Blacklist Removed: ${discordId}`);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.BlacklistService = BlacklistService;
