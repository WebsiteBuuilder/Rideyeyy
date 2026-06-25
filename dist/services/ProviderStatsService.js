"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderStatsService = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../lib/prisma");
function toRow(stats) {
    return {
        discordId: stats.discordId,
        claims: stats.claims,
        completed: stats.completed,
        cancelled: stats.cancelled,
        avgRating: new decimal_js_1.default(stats.avgRating.toString()),
        revenue: new decimal_js_1.default(stats.revenue.toString()),
    };
}
async function ensureUser(discordId) {
    await prisma_1.prisma.user.upsert({ where: { discordId }, create: { discordId }, update: {} });
}
class ProviderStatsService {
    async ensureStats(discordId) {
        await ensureUser(discordId);
        await prisma_1.prisma.providerStats.upsert({ where: { discordId }, create: { discordId }, update: {} });
    }
    async incrementClaims(discordId) {
        await this.ensureStats(discordId);
        await prisma_1.prisma.providerStats.update({ where: { discordId }, data: { claims: { increment: 1 } } });
    }
    async incrementCompleted(discordId, revenue) {
        await this.ensureStats(discordId);
        await prisma_1.prisma.providerStats.update({
            where: { discordId },
            data: { completed: { increment: 1 }, revenue: { increment: revenue.toFixed(2) } },
        });
    }
    async incrementCancelled(discordId) {
        await this.ensureStats(discordId);
        await prisma_1.prisma.providerStats.update({ where: { discordId }, data: { cancelled: { increment: 1 } } });
    }
    async recalculateAvgRating(providerId) {
        const ratings = await prisma_1.prisma.booking.findMany({
            where: { providerId, status: 'COMPLETED', rating: { not: null } },
            select: { rating: true },
        });
        if (ratings.length === 0)
            return;
        const avg = (ratings.reduce((a, r) => a + (r.rating ?? 0), 0) / ratings.length).toFixed(2);
        await this.ensureStats(providerId);
        await prisma_1.prisma.providerStats.update({ where: { discordId: providerId }, data: { avgRating: avg } });
    }
    async getProviderStats(discordId) {
        await this.ensureStats(discordId);
        return toRow(await prisma_1.prisma.providerStats.findUniqueOrThrow({ where: { discordId } }));
    }
    async getTopProvidersByCompletedJobs(limit) {
        return (await prisma_1.prisma.providerStats.findMany({
            orderBy: { completed: 'desc' },
            take: limit,
            where: { completed: { gt: 0 } },
        })).map(toRow);
    }
    async getTopProvidersByRevenue(limit) {
        return (await prisma_1.prisma.providerStats.findMany({
            orderBy: { revenue: 'desc' },
            take: limit,
            where: { revenue: { gt: 0 } },
        })).map(toRow);
    }
    async getTopProvidersByAverageRating(limit, minCompleted = 3) {
        return (await prisma_1.prisma.providerStats.findMany({
            where: { completed: { gte: minCompleted }, avgRating: { gt: 0 } },
            orderBy: { avgRating: 'desc' },
            take: limit,
        })).map(toRow);
    }
}
exports.ProviderStatsService = ProviderStatsService;
