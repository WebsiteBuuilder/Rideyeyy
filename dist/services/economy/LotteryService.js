"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LotteryService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const casinoEmbeds_1 = require("../../utils/casinoEmbeds");
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
        await prisma_1.prisma.$transaction(async (tx) => {
            if (winnerUserId) {
                const issued = await this.redemption.issue({ guildId, userId: winnerUserId, rewardKey: prizeKey, source: client_1.RedemptionSource.LOTTERY }, tx);
                redemptionCode = issued.id;
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
        if (winnerUserId) {
            await this.dmWinner(client, winnerUserId, prizeKey);
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
            const prizeLabel = this.redemption.label(outcome.prizeKey);
            const embed = (0, casinoEmbeds_1.buildLotteryEmbed)({
                mode: 'results',
                prizeLabel,
                totalTickets: outcome.totalTickets,
                participants: outcome.participants,
                resultsDetail: {
                    winnerUserId: outcome.winnerUserId,
                    totalTickets: outcome.totalTickets,
                    participants: outcome.participants,
                },
            });
            if (outcome.winnerUserId) {
                await channel.send({ content: `<@${outcome.winnerUserId}>`, embeds: [embed] });
            }
            else {
                await channel.send({ embeds: [embed] });
            }
        }
        catch (err) {
            console.error('[Lottery] announce failed:', err);
        }
    }
    async dmWinner(client, userId, prizeKey) {
        try {
            const user = await client.users.fetch(userId);
            const embed = (0, casinoEmbeds_1.buildLotteryWinnerDmEmbed)(this.redemption.label(prizeKey));
            await user.send({ embeds: [embed] });
        }
        catch {
            /* DMs closed — reward is in /rewards wallet */
        }
    }
}
exports.LotteryService = LotteryService;
