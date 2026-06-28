"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotteryPanelData = void 0;
exports.buildLotteryPanelEmbed = buildLotteryPanelEmbed;
exports.ensureLotteryPanel = ensureLotteryPanel;
exports.handleLotteryPanel = handleLotteryPanel;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = require("../lib/prisma");
const discord_1 = require("../utils/discord");
const lotterySchedule_1 = require("../utils/lotterySchedule");
const panels_1 = require("./panels");
const PANEL_KEY = 'lottery';
exports.lotteryPanelData = new discord_js_1.SlashCommandBuilder()
    .setName('lotterypanel')
    .setDescription('Post or refresh the weekly lottery panel (staff only)');
async function resolveLotteryChannelId(guildId) {
    const cfg = await prisma_1.prisma.inviteConfig.findUnique({ where: { guildId } });
    const fromDb = cfg?.lotteryChannelId;
    if (fromDb && fromDb !== '0')
        return fromDb;
    const env = process.env['LOTTERY_CHANNEL_ID'];
    if (env && env !== '0')
        return env;
    return null;
}
async function buildLotteryPanelEmbed(guildId, services) {
    const cfg = await services.invite.admin.getConfig(guildId);
    const pot = await services.lottery.getPot(guildId);
    const last = await services.lottery.lastDraw(guildId);
    const prize = services.redemption.label(cfg.lotteryPrizeKey);
    const { drawDayOfWeek, drawHourUtc } = config_1.config.economy.lottery;
    const nextDraw = (0, lotterySchedule_1.nextLotteryDrawUtc)(drawDayOfWeek, drawHourUtc, new Date());
    const nextUnix = Math.floor(nextDraw.getTime() / 1000);
    const lastLine = last?.winnerUserId
        ? `<@${last.winnerUserId}> won on <t:${Math.floor(last.drawnAt.getTime() / 1000)}:D>`
        : last
            ? `No winner on <t:${Math.floor(last.drawnAt.getTime() / 1000)}:D>`
            : '_First draw coming soon!_';
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT)
        .setAuthor({ name: `${discord_1.BRAND.logo}  GUHD RIDES WEEKLY LOTTERY` })
        .setTitle(`${discord_1.ICON.jackpot}  ${prize.toUpperCase()}`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  JACKPOT LIVE  ${discord_1.ICON.jackpot}`, 'jackpot') +
        `\n${discord_1.LINE}\n` +
        `**Current Pot**\n` +
        `\`${pot.totalTickets.toLocaleString()}\` tickets · **${pot.participants}** entrants\n\n` +
        `**Grand Prize**\n` +
        `${discord_1.ICON.win} ${prize}\n\n` +
        `**Next Draw**\n` +
        `<t:${nextUnix}:R> · <t:${nextUnix}:F>\n\n` +
        `**Last Winner**\n` +
        `${lastLine}\n\n` +
        `_Earn tickets from \`/daily\`, invites, and completed rides. Check yours with \`/lottery\`._`)
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` })
        .setTimestamp();
}
async function ensureLotteryPanel(client, services, guildId) {
    const guilds = guildId ? [guildId] : [...client.guilds.cache.keys()];
    for (const gid of guilds) {
        const channelId = await resolveLotteryChannelId(gid);
        if (!channelId)
            continue;
        try {
            const embed = await buildLotteryPanelEmbed(gid, services);
            await prisma_1.prisma.panel.upsert({
                where: { key: PANEL_KEY },
                create: { key: PANEL_KEY, content: 'lottery', channelId },
                update: { channelId },
            });
            await (0, panels_1.publishPanel)(client, PANEL_KEY, channelId, embed, []);
        }
        catch (err) {
            console.warn(`[Bot] Lottery panel ensure failed for guild ${gid}:`, err);
        }
    }
}
async function handleLotteryPanel(interaction, services) {
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be staff to manage this panel.');
        return;
    }
    if (!interaction.guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const channelId = await resolveLotteryChannelId(interaction.guildId);
    if (!channelId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Lottery channel is not configured. Set it in `/admin economy` → Set Channels or `LOTTERY_CHANNEL_ID`.');
        return;
    }
    try {
        await ensureLotteryPanel(interaction.client, services, interaction.guildId);
        await (0, discord_1.ephemeralReply)(interaction, `Lottery panel posted in <#${channelId}>.`);
    }
    catch (err) {
        console.error('[Bot] Failed to publish lottery panel:', err);
        await (0, discord_1.ephemeralReply)(interaction, 'Failed to post the lottery panel. Check my permissions in that channel.');
    }
}
