"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsService = void 0;
const discord_js_1 = require("discord.js");
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
// ═══════════════════════════════════════════════════════════════════════════
//  OperationsService — open/close bookings and rename the ticket category.
// ═══════════════════════════════════════════════════════════════════════════
class OperationsService {
    async isBookingsOpen(guildId) {
        const cfg = await prisma_1.prisma.inviteConfig.findUnique({ where: { guildId } });
        return cfg?.bookingsOpen ?? true;
    }
    async setBookingsOpen(guild, open) {
        const guildId = guild.id;
        await prisma_1.prisma.inviteConfig.upsert({
            where: { guildId },
            create: { guildId, bookingsOpen: open },
            update: { bookingsOpen: open },
        });
        const categoryId = config_1.config.channels.bookingCategory;
        if (categoryId === '0')
            return;
        const name = open ? config_1.config.operations.categoryOpenName : config_1.config.operations.categoryClosedName;
        try {
            const category = await guild.channels.fetch(categoryId);
            if (category?.type === discord_js_1.ChannelType.GuildCategory) {
                await category.setName(name);
            }
        }
        catch (err) {
            console.warn('[Operations] Could not rename booking category:', err.message);
        }
    }
}
exports.OperationsService = OperationsService;
