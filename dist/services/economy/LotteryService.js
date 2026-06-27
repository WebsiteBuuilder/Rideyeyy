"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LotteryService = void 0;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const discord_1 = require("../../utils/discord");
class LotteryService {
    constructor(repo, redemption, logging) {
        this.repo = repo;
        this.redemption = redemption;
        this.logging = logging;
    }
    async grantTickets(guildId, userId, source, amount) {
        if (amount <= 0)
            return;
        await this.repo.addTickets(guildId, userId, amount);
        await this.logging.log({ guildId, event: 'LOTTERY_TICKETS', actorId: userId, detail: `+${amount} ticket(s) from ${source}` });
    }
    getTickets(guildId, userId) {
        return this.repo.getTickets(guildId, userId);
    }
    getPot(guildId) {
        return this.repo.pot(guildId);
    }
    lastDraw(guildId) {
        return this.repo.lastDraw(guildId);
    }
    /** Run the weekly draw: pick a weighted winner, issue the prize, reset tickets. */
    async drawWeekly(client, guild, cfg) {
        const guildId = guild.id;
        const entrants = await this.repo.entrants(guildId);
        const totalTickets = entrants.reduce((sum, e) => sum + e.tickets, 0);
        const participants = entrants.length;
        let winnerUserId = null;
        if (totalTickets > 0) {
            let roll = Math.floor(Math.random() * totalTickets);
            for (const e of entrants) {
                roll -= e.tickets;
                if (roll < 0) {
                    winnerUserId = e.userId;
                    break;
                }
            }
        }
        const prizeKey = cfg.lotteryPrizeKey;
        let redemptionCode = null;
        // Atomically record the draw, issue the prize code, and reset all tickets.
        await prisma_1.prisma.$transaction(async (tx) => {
            if (winnerUserId) {
                const code = this.redemption.generateCode();
                await tx.redemption.create({
                    data: { guildId, userId: winnerUserId, rewardKey: prizeKey, code, source: client_1.RedemptionSource.LOTTERY },
                });
                redemptionCode = code;
            }
            await tx.lotteryDraw.create({
                data: { guildId, winnerUserId, totalTickets, participants, prizeKey, redemptionCode },
            });
            await tx.lotteryTicket.updateMany({ where: { guildId }, data: { tickets: 0 } });
        });
        await this.logging.log({
            guildId,
            event: 'LOTTERY_DRAW',
            targetUserId: winnerUserId,
            detail: winnerUserId
                ? `Winner <@${winnerUserId}> — ${participants} entrants, ${totalTickets} tickets`
                : `No entrants this week`,
        });
        await this.announce(client, guild, cfg, { winnerUserId, totalTickets, participants, prizeKey, redemptionCode });
        if (winnerUserId && redemptionCode) {
            await this.dmWinner(client, winnerUserId, prizeKey, redemptionCode);
        }
        return { winnerUserId, totalTickets, participants, prizeKey, redemptionCode };
    }
    async announce(client, guild, cfg, outcome) {
        const channelId = cfg.lotteryChannelId ?? cfg.announceChannelId;
        if (!channelId || channelId === '0')
            return;
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased() || channel.isDMBased())
                return;
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.JACKPOT)
                .setAuthor({ name: `${discord_1.BRAND.logo}  Weekly Lottery` })
                .setTitle(`${discord_1.ICON.jackpot} Weekly Lottery Results`)
                .setTimestamp();
            if (outcome.winnerUserId) {
                embed.setDescription(`${discord_1.LINE}\n${discord_1.ICON.win} Winner: <@${outcome.winnerUserId}>\n` +
                    `Prize: **${this.redemption.label(outcome.prizeKey)}**\n` +
                    `Entrants: **${outcome.participants}** · Tickets: **${outcome.totalTickets}**\n\n` +
                    `_Tickets have been reset for the new week. Earn more by being active!_`);
                await channel.send({ content: `<@${outcome.winnerUserId}>`, embeds: [embed] });
            }
            else {
                embed.setDescription(`${discord_1.LINE}\nNo tickets were entered this week — no winner. A new week begins now!`);
                await channel.send({ embeds: [embed] });
            }
        }
        catch (err) {
            console.error('[Lottery] announce failed:', err);
        }
    }
    async dmWinner(client, userId, prizeKey, code) {
        try {
            const user = await client.users.fetch(userId);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.WIN)
                .setAuthor({ name: `${discord_1.BRAND.logo}  Weekly Lottery` })
                .setTitle(`${discord_1.ICON.jackpot} You won the weekly lottery!`)
                .setDescription(`Your prize: **${this.redemption.label(prizeKey)}**\nRedemption code: \`${code}\`\n\nShow this code to staff to claim your reward.`)
                .setTimestamp();
            await user.send({ embeds: [embed] });
        }
        catch {
            /* DMs closed — code is still retrievable via /redeem listing */
        }
    }
}
exports.LotteryService = LotteryService;
