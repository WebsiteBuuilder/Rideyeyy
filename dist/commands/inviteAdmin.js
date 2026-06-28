"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminData = void 0;
exports.handleAdmin = handleAdmin;
exports.handleAdminSelect = handleAdminSelect;
exports.handleAdminButton = handleAdminButton;
exports.handleAdminModal = handleAdminModal;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const prisma_1 = require("../lib/prisma");
const discord_1 = require("../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  /admin economy — unified referral-economy configuration & management panel
//  (Administrator only). Covers invites, milestones, lottery, shop, and more.
// ═══════════════════════════════════════════════════════════════════════════
exports.adminData = new discord_js_1.SlashCommandBuilder()
    .setName('admin')
    .setDescription('GUHD RIDES administration')
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('economy').setDescription('Configure invites, milestones, lottery, and the reward shop'));
const SECTIONS = [
    { value: 'overview', label: 'Overview', description: 'Current configuration summary', emoji: '🏠' },
    { value: 'settings', label: 'General Settings', description: 'Module toggles & channels', emoji: '⚙️' },
    { value: 'rewards', label: 'Invite Rewards', description: 'Amount & caps', emoji: '💰' },
    { value: 'verification', label: 'Verification', description: 'Delay, age, messages, anti-alt', emoji: '🛡️' },
    { value: 'milestones', label: 'Milestones', description: 'RC / role / ride / tickets', emoji: '🏆' },
    { value: 'lottery', label: 'Lottery', description: 'Tickets, prize & draws', emoji: '🎟️' },
    { value: 'shop', label: 'Reward Shop', description: 'Items & prices', emoji: '🛒' },
    { value: 'statistics', label: 'Statistics', description: 'Guild-wide analytics', emoji: '📊' },
    { value: 'leaderboard', label: 'Leaderboard', description: 'Top inviters', emoji: '🥇' },
    { value: 'logs', label: 'Logs', description: 'Recent events', emoji: '📜' },
    { value: 'exports', label: 'Exports', description: 'CSV / JSON data', emoji: '📤' },
    { value: 'backup', label: 'Backup', description: 'DM verified members backup link', emoji: '🔗' },
    { value: 'manageuser', label: 'Manage User', description: 'Per-user overrides', emoji: '🧰' },
    { value: 'reset', label: 'Reset', description: 'Counters & data', emoji: '🔄' },
    { value: 'danger', label: 'Danger Zone', description: 'Wipe all invite data', emoji: '⚠️' },
];
function isAdmin(interaction) {
    if (!interaction.inGuild())
        return false;
    const perms = interaction.memberPermissions;
    return perms?.has(discord_js_1.PermissionFlagsBits.Administrator) ?? false;
}
// ── Entry point ─────────────────────────────────────────────────────────────
async function handleAdmin(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You need Administrator permission to use this.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const view = await renderSection('overview', interaction.guildId, services);
    await interaction.editReply(view);
}
// ── Navigation (select menu) ──────────────────────────────────────────────---
async function handleAdminSelect(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction))
        return;
    if (interaction.customId === 'invadm:shop:pick') {
        const view = await renderSection('shop', interaction.guildId, services, interaction.values[0]);
        await interaction.update(view);
        return;
    }
    const section = interaction.values[0];
    const view = await renderSection(section, interaction.guildId, services);
    await interaction.update(view);
}
// ── Buttons ─────────────────────────────────────────────────────────────────
async function handleAdminButton(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Administrator only.', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const guildId = interaction.guildId;
    // customId: invadm:btn:<section>:<action>[:arg]
    const [, , section, action, arg] = interaction.customId.split(':');
    // Modal-opening actions must call showModal directly (no defer).
    if (action === 'edit') {
        await openSectionModal(interaction, section, services);
        return;
    }
    if (action === 'modal') {
        await openSectionModal(interaction, arg, services);
        return;
    }
    // Toggle config booleans.
    if (action === 'toggle') {
        const cfg = await services.invite.admin.getConfig(guildId);
        const field = arg;
        const current = cfg[field];
        if (typeof current === 'boolean') {
            await services.invite.admin.updateConfig(guildId, { [field]: !current });
        }
        const view = await renderSection(section, guildId, services);
        await interaction.update(view);
        return;
    }
    // Reset actions are confirm-gated.
    if (action === 'reset') {
        await interaction.update(buildConfirmView(section, arg));
        return;
    }
    if (action === 'confirm') {
        await runReset(interaction, arg, services);
        return;
    }
    if (action === 'cancel') {
        const view = await renderSection(section, guildId, services);
        await interaction.update(view);
        return;
    }
    // Exports.
    if (action === 'export') {
        await sendExport(interaction, arg, services);
        return;
    }
    // Backup server mass-DM pull.
    if (action === 'pullbackup') {
        await interaction.deferUpdate();
        try {
            const result = await services.memberVerify.pullMembersToBackup(interaction.client, guildId);
            await interaction.followUp({
                content: `Backup DM pull complete: **${result.sent}** sent, **${result.failed}** failed (${result.total} verified members).`,
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        catch (err) {
            await interaction.followUp({
                content: err.message ?? 'Backup pull failed.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        return;
    }
    // Recalculate aggregates.
    if (action === 'recalc') {
        await interaction.deferUpdate();
        const n = await services.invite.admin.recalculateAll(guildId);
        const view = await renderSection('statistics', guildId, services);
        await interaction.editReply(view);
        await interaction.followUp({ content: `Recomputed ${n} inviter aggregates.`, flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    // Manual lottery draw.
    if (action === 'draw') {
        await interaction.deferUpdate();
        const cfg = await services.invite.admin.getConfig(guildId);
        if (interaction.guild) {
            const outcome = await services.lottery.drawWeekly(interaction.client, interaction.guild, cfg);
            const view = await renderSection('lottery', guildId, services);
            await interaction.editReply(view);
            await interaction.followUp({
                content: outcome.winnerUserId
                    ? `Draw complete — winner <@${outcome.winnerUserId}> (${outcome.totalTickets} tickets).`
                    : 'Draw complete — no entrants this period.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
        }
        return;
    }
    // Shop item management (customId: invadm:btn:shop:<action>[:key])
    if (section === 'shop') {
        const itemKey = arg;
        if (action === 'edit' && itemKey) {
            const field = interaction.customId.split(':')[5];
            await openShopEditModal(interaction, guildId, itemKey, field ?? 'label', services);
            return;
        }
        if (action === 'itemtoggle' && itemKey) {
            await services.shop.toggleItem(guildId, itemKey);
            const view = await renderSection('shop', guildId, services, itemKey);
            await interaction.update(view);
            return;
        }
        if (action === 'itemremove' && itemKey) {
            await services.shop.removeItem(guildId, itemKey);
            const view = await renderSection('shop', guildId, services);
            await interaction.update(view);
            return;
        }
        if (action === 'itemup' && itemKey) {
            await services.shop.moveItem(guildId, itemKey, -1);
            const view = await renderSection('shop', guildId, services, itemKey);
            await interaction.update(view);
            return;
        }
        if (action === 'itemdown' && itemKey) {
            await services.shop.moveItem(guildId, itemKey, 1);
            const view = await renderSection('shop', guildId, services, itemKey);
            await interaction.update(view);
            return;
        }
    }
}
// ── Modals ──────────────────────────────────────────────────────────────────
async function handleAdminModal(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction))
        return;
    const guildId = interaction.guildId;
    const action = interaction.customId.split(':')[2]; // invadm:modal:<action>
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const num = (id) => {
        const raw = interaction.fields.getTextInputValue(id).trim();
        if (raw === '')
            return null;
        const n = Number(raw.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    };
    const str = (id) => interaction.fields.getTextInputValue(id).trim();
    switch (action) {
        case 'rewards': {
            const data = {};
            const rewardAmount = num('rewardAmount');
            const dailyCap = num('dailyCap');
            const weeklyCap = num('weeklyCap');
            const monthlyCap = num('monthlyCap');
            const maxRewards = num('maxRewards');
            if (rewardAmount != null)
                data.rewardAmount = Math.max(0, Math.round(rewardAmount));
            if (dailyCap != null)
                data.dailyCap = Math.max(0, Math.round(dailyCap));
            if (weeklyCap != null)
                data.weeklyCap = Math.max(0, Math.round(weeklyCap));
            if (monthlyCap != null)
                data.monthlyCap = Math.max(0, Math.round(monthlyCap));
            if (maxRewards != null)
                data.maxRewardsPerInviter = Math.max(0, Math.round(maxRewards));
            await services.invite.admin.updateConfig(guildId, data);
            await (0, discord_1.ephemeralReply)(interaction, 'Reward settings updated.');
            return;
        }
        case 'verification': {
            const data = {};
            const delaySec = num('delaySec');
            const minAge = num('minAge');
            const minMsg = num('minMessages');
            const maxAttempts = num('maxAttempts');
            if (delaySec != null)
                data.verificationDelaySec = Math.max(0, Math.round(delaySec));
            if (minAge != null)
                data.minAccountAgeDays = Math.max(0, Math.round(minAge));
            if (minMsg != null)
                data.minMessages = Math.max(0, Math.round(minMsg));
            if (maxAttempts != null)
                data.maxVerifyAttempts = Math.max(1, Math.round(maxAttempts));
            await services.invite.admin.updateConfig(guildId, data);
            await (0, discord_1.ephemeralReply)(interaction, 'Verification settings updated.');
            return;
        }
        case 'channels': {
            const logging = str('logging');
            const announce = str('announce');
            const lottery = str('lottery');
            await services.invite.admin.updateConfig(guildId, {
                loggingChannelId: logging || null,
                announceChannelId: announce || null,
                lotteryChannelId: lottery || null,
            });
            await (0, discord_1.ephemeralReply)(interaction, 'Channels updated.');
            return;
        }
        case 'lottery': {
            const data = {};
            const perDaily = num('perDaily');
            const perInvite = num('perInvite');
            const perRide = num('perRide');
            const perEvent = num('perEvent');
            const prize = str('prizeKey');
            if (perDaily != null)
                data.ticketsPerDaily = Math.max(0, Math.round(perDaily));
            if (perInvite != null)
                data.ticketsPerInvite = Math.max(0, Math.round(perInvite));
            if (perRide != null)
                data.ticketsPerRide = Math.max(0, Math.round(perRide));
            if (perEvent != null)
                data.ticketsPerEvent = Math.max(0, Math.round(perEvent));
            if (prize)
                data.lotteryPrizeKey = prize;
            await services.invite.admin.updateConfig(guildId, data);
            await (0, discord_1.ephemeralReply)(interaction, 'Lottery settings updated.');
            return;
        }
        case 'shopadd': {
            const key = str('key').toUpperCase();
            const label = str('label');
            const priceRc = num('priceRc');
            const rewardKey = str('rewardKey').toUpperCase() || key;
            const description = str('description') || null;
            if (!key || !label || priceRc == null || priceRc < 0) {
                await (0, discord_1.ephemeralReply)(interaction, 'Key, label, and a non-negative price are required.');
                return;
            }
            const existing = await services.shop.listAll(guildId);
            const sortOrder = existing.find((i) => i.key === key)?.sortOrder ?? existing.length;
            await services.shop.upsertItem({
                guildId,
                key,
                label,
                description,
                priceRc: Math.round(priceRc),
                rewardKey,
                sortOrder,
            });
            await (0, discord_1.ephemeralReply)(interaction, `Shop item **${label}** saved (${Math.round(priceRc)} ${discord_1.BRAND.ticker}).`);
            return;
        }
        case 'shopeditlabel': {
            const key = str('key').toUpperCase();
            const label = str('label');
            if (!key || !label) {
                await (0, discord_1.ephemeralReply)(interaction, 'Key and label are required.');
                return;
            }
            const item = (await services.shop.listAll(guildId)).find((i) => i.key === key);
            if (!item) {
                await (0, discord_1.ephemeralReply)(interaction, 'Item not found.');
                return;
            }
            await services.shop.upsertItem({
                guildId,
                key: item.key,
                label,
                description: item.description,
                priceRc: item.priceRc,
                rewardKey: item.rewardKey,
                sortOrder: item.sortOrder,
                enabled: item.enabled,
            });
            await (0, discord_1.ephemeralReply)(interaction, `Updated label for **${key}**.`);
            return;
        }
        case 'shopeditprice': {
            const key = str('key').toUpperCase();
            const priceRc = num('priceRc');
            if (!key || priceRc == null || priceRc < 0) {
                await (0, discord_1.ephemeralReply)(interaction, 'Key and a non-negative price are required.');
                return;
            }
            const item = (await services.shop.listAll(guildId)).find((i) => i.key === key);
            if (!item) {
                await (0, discord_1.ephemeralReply)(interaction, 'Item not found.');
                return;
            }
            await services.shop.upsertItem({
                guildId,
                key: item.key,
                label: item.label,
                description: item.description,
                priceRc: Math.round(priceRc),
                rewardKey: item.rewardKey,
                sortOrder: item.sortOrder,
                enabled: item.enabled,
            });
            await (0, discord_1.ephemeralReply)(interaction, `Updated price for **${key}** (${Math.round(priceRc)} ${discord_1.BRAND.ticker}).`);
            return;
        }
        case 'shopremove': {
            const key = str('key').toUpperCase();
            if (!key) {
                await (0, discord_1.ephemeralReply)(interaction, 'Provide an item key to remove.');
                return;
            }
            const ok = await services.shop.removeItem(guildId, key);
            await (0, discord_1.ephemeralReply)(interaction, ok ? `Removed shop item \`${key}\`.` : 'No item with that key.');
            return;
        }
        case 'milestoneadd': {
            const threshold = num('threshold');
            const rewardAmount = num('rewardAmount') ?? 0;
            const roleId = str('roleId') || null;
            const rideKey = str('rideKey').toUpperCase() || null;
            const tickets = num('tickets') ?? 0;
            if (threshold == null || threshold <= 0) {
                await (0, discord_1.ephemeralReply)(interaction, 'Threshold must be a positive number.');
                return;
            }
            const label = `Milestone ${Math.round(threshold)}`;
            await services.invite.admin.addMilestone(guildId, Math.round(threshold), Math.max(0, Math.round(rewardAmount)), roleId, label, rideKey, Math.max(0, Math.round(tickets)));
            await (0, discord_1.ephemeralReply)(interaction, `Milestone at **${Math.round(threshold)}** invites saved.`);
            return;
        }
        case 'milestoneremove': {
            const threshold = num('threshold');
            if (threshold == null) {
                await (0, discord_1.ephemeralReply)(interaction, 'Provide a milestone threshold to remove.');
                return;
            }
            const ok = await services.invite.admin.removeMilestone(guildId, Math.round(threshold));
            await (0, discord_1.ephemeralReply)(interaction, ok ? `Removed milestone at ${Math.round(threshold)}.` : 'No milestone at that threshold.');
            return;
        }
        case 'manageuser': {
            const userId = str('userId');
            const joinId = str('joinId');
            const act = str('action').toLowerCase();
            const amount = num('amount');
            await runManageUser(interaction, services, guildId, { userId, joinId, action: act, amount });
            return;
        }
        default:
            await (0, discord_1.ephemeralReply)(interaction, 'Unknown action.');
    }
}
async function runManageUser(interaction, services, guildId, input) {
    const { userId, joinId, action, amount } = input;
    const admin = services.invite.admin;
    try {
        switch (action) {
            case 'give':
                if (!userId || amount == null)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'give requires userId and amount.'));
                await admin.giveManual(guildId, userId, Math.round(amount), interaction.user.id);
                return void (await (0, discord_1.ephemeralReply)(interaction, `Granted ${Math.round(amount)} ${discord_1.BRAND.ticker} to <@${userId}>.`));
            case 'resetuser':
                if (!userId)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'resetuser requires userId.'));
                await admin.resetUser(guildId, userId, interaction.user.id);
                return void (await (0, discord_1.ephemeralReply)(interaction, `Reset all invite data for <@${userId}>.`));
            case 'recalc':
                if (!userId)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'recalc requires userId.'));
                await services.invite.stats.recomputeUserStats(guildId, userId);
                return void (await (0, discord_1.ephemeralReply)(interaction, `Recomputed stats for <@${userId}>.`));
            case 'reverify':
                if (!joinId)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'reverify requires joinId.'));
                return void (await (0, discord_1.ephemeralReply)(interaction, (await admin.reverify(guildId, joinId)) ? 'Join set to re-verify on next sweep.' : 'Join not found.'));
            case 'markfake':
                if (!joinId)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'markfake requires joinId.'));
                return void (await (0, discord_1.ephemeralReply)(interaction, (await admin.markFake(guildId, joinId, client_1.InviteFakeReason.MANUAL)) ? 'Join marked fake.' : 'Join not found.'));
            case 'removereward':
                if (!joinId)
                    return void (await (0, discord_1.ephemeralReply)(interaction, 'removereward requires joinId.'));
                return void (await (0, discord_1.ephemeralReply)(interaction, (await admin.removeReward(guildId, joinId)) ? 'Reward removed and RouteCash clawed back.' : 'No paid reward on that join.'));
            default:
                await (0, discord_1.ephemeralReply)(interaction, 'Unknown action. Use: give, resetuser, recalc, reverify, markfake, removereward.');
        }
    }
    catch (err) {
        console.error('[Invite] manage-user failed:', err);
        await (0, discord_1.ephemeralReply)(interaction, `Action failed: ${err.message}`);
    }
}
// ── Reset execution ─────────────────────────────────────────────────────────
async function runReset(interaction, type, services) {
    const guildId = interaction.guildId;
    const admin = services.invite.admin;
    const by = interaction.user.id;
    await interaction.deferUpdate();
    let msg = '';
    switch (type) {
        case 'weekly':
            await admin.resetWeekly(guildId, by);
            msg = 'Weekly counters reset.';
            break;
        case 'monthly':
            await admin.resetMonthly(guildId, by);
            msg = 'Monthly counters reset.';
            break;
        case 'leaderboard':
            await admin.resetLeaderboard(guildId, by);
            msg = 'Leaderboard aggregates cleared (recompute via Statistics → Recalculate).';
            break;
        case 'rewards':
            await admin.resetRewards(guildId, by);
            msg = 'Reward audit history cleared.';
            break;
        case 'cache':
            if (interaction.guild)
                await services.invite.resetCache(interaction.guild);
            msg = 'Invite cache re-primed.';
            break;
        case 'guild':
            await admin.resetGuild(guildId, by);
            msg = 'ALL invite tracking data wiped.';
            break;
        default:
            msg = 'Unknown reset.';
    }
    const view = await renderSection(type === 'guild' ? 'danger' : 'reset', guildId, services);
    await interaction.editReply(view);
    await interaction.followUp({ content: msg, flags: discord_js_1.MessageFlags.Ephemeral });
}
// ── Exports ─────────────────────────────────────────────────────────────────
async function sendExport(interaction, format, _services) {
    const guildId = interaction.guildId;
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const stats = await prisma_1.prisma.inviteUserStats.findMany({ where: { guildId }, orderBy: { verified: 'desc' } });
    if (format === 'json') {
        const joins = await prisma_1.prisma.inviteJoin.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 5000 });
        const payload = JSON.stringify({ exportedAt: new Date().toISOString(), guildId, stats, joins }, null, 2);
        const file = new discord_js_1.AttachmentBuilder(Buffer.from(payload, 'utf8'), { name: `invite-export-${guildId}.json` });
        await interaction.editReply({ content: 'Invite data export (JSON):', files: [file] });
        return;
    }
    // CSV (leaderboard / per-user stats).
    const header = 'userId,verified,pending,fake,lifetime,rcEarned,milestonesCompleted,weeklyCount,monthlyCount,streak';
    const rows = stats.map((s) => [s.userId, s.verified, s.pending, s.fake, s.lifetime, s.rcEarned.toString(), s.milestonesCompleted, s.weeklyCount, s.monthlyCount, s.streak].join(','));
    const csv = [header, ...rows].join('\n');
    const file = new discord_js_1.AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `invite-stats-${guildId}.csv` });
    await interaction.editReply({ content: 'Invite stats export (CSV):', files: [file] });
}
// ── Section rendering ─────────────────────────────────────────────────────---
function navRow(active) {
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId('invadm:nav')
        .setPlaceholder('Jump to a section…')
        .addOptions(SECTIONS.map((s) => ({
        label: s.label,
        value: s.value,
        description: s.description,
        emoji: s.emoji,
        default: s.value === active,
    })));
    return new discord_js_1.ActionRowBuilder().addComponents(menu);
}
function onOff(v) {
    return v ? `${discord_1.ICON.check} On` : `${discord_1.ICON.cross} Off`;
}
async function renderSection(section, guildId, services, shopSelectedKey) {
    const cfg = await services.invite.admin.getConfig(guildId);
    const nav = navRow(section);
    const rows = [nav];
    let embed;
    switch (section) {
        case 'settings': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
                .setTitle(`${discord_1.ICON.coin} General Settings`)
                .setDescription(`${discord_1.LINE}\nModule toggles, automatic resets, and announcement channels.`)
                .addFields({ name: 'Rewards', value: onOff(cfg.rewardEnabled), inline: true }, { name: 'Milestones', value: onOff(cfg.milestonesEnabled), inline: true }, { name: 'Lottery', value: onOff(cfg.lotteryEnabled), inline: true }, { name: 'Shop', value: onOff(cfg.shopEnabled), inline: true }, { name: 'Anti-Alt', value: onOff(cfg.antiAltEnabled), inline: true }, { name: 'Auto Announce', value: onOff(cfg.autoAnnounce), inline: true }, { name: 'Weekly Reset', value: onOff(cfg.weeklyResetEnabled), inline: true }, { name: 'Monthly Reset', value: onOff(cfg.monthlyResetEnabled), inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Logging Channel', value: cfg.loggingChannelId ? `<#${cfg.loggingChannelId}>` : '—', inline: true }, { name: 'Announce Channel', value: cfg.announceChannelId ? `<#${cfg.announceChannelId}>` : '—', inline: true }, { name: 'Lottery Channel', value: cfg.lotteryChannelId ? `<#${cfg.lotteryChannelId}>` : '—', inline: true });
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(toggleBtn('settings', 'rewardEnabled', 'Rewards'), toggleBtn('settings', 'milestonesEnabled', 'Milestones'), toggleBtn('settings', 'lotteryEnabled', 'Lottery'), toggleBtn('settings', 'shopEnabled', 'Shop')), new discord_js_1.ActionRowBuilder().addComponents(toggleBtn('settings', 'antiAltEnabled', 'Anti-Alt'), toggleBtn('settings', 'autoAnnounce', 'Announce'), toggleBtn('settings', 'weeklyResetEnabled', 'Weekly Reset'), toggleBtn('settings', 'monthlyResetEnabled', 'Monthly Reset')), new discord_js_1.ActionRowBuilder().addComponents(modalBtn('settings', 'channels', 'Set Channels', discord_js_1.ButtonStyle.Secondary)));
            break;
        }
        case 'rewards': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
                .setTitle(`${discord_1.ICON.coin} Reward Settings`)
                .setDescription(`${discord_1.LINE}\n_0 means unlimited for caps._`)
                .addFields({ name: 'Reward / Invite', value: `${cfg.rewardAmount} ${discord_1.BRAND.ticker}`, inline: true }, { name: 'Daily Cap', value: `${cfg.dailyCap}`, inline: true }, { name: 'Weekly Cap', value: `${cfg.weeklyCap}`, inline: true }, { name: 'Monthly Cap', value: `${cfg.monthlyCap}`, inline: true }, { name: 'Max / Inviter', value: `${cfg.maxRewardsPerInviter}`, inline: true });
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('rewards', 'rewards', 'Edit Rewards & Caps', discord_js_1.ButtonStyle.Primary)));
            break;
        }
        case 'verification': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC)
                .setTitle(`${discord_1.ICON.check} Verification`)
                .setDescription(`${discord_1.LINE}\nA member under the minimum message count is re-checked each cycle (up to the attempt cap) before being marked fake.`)
                .addFields({ name: 'Verification Delay', value: `${cfg.verificationDelaySec}s (${Math.round(cfg.verificationDelaySec / 60)} min)`, inline: true }, { name: 'Min Account Age', value: `${cfg.minAccountAgeDays} days`, inline: true }, { name: 'Min Messages', value: `${cfg.minMessages}`, inline: true }, { name: 'Max Verify Attempts', value: `${cfg.maxVerifyAttempts}`, inline: true }, { name: 'Anti-Alt', value: onOff(cfg.antiAltEnabled), inline: true });
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('verification', 'verification', 'Edit Verification', discord_js_1.ButtonStyle.Primary), toggleBtn('verification', 'antiAltEnabled', 'Toggle Anti-Alt')));
            break;
        }
        case 'lottery': {
            const pot = await services.lottery.getPot(guildId);
            const last = await services.lottery.lastDraw(guildId);
            const lastLine = last
                ? last.winnerUserId
                    ? `<@${last.winnerUserId}> won ${last.totalTickets} tickets on ${last.drawnAt.toISOString().slice(0, 10)}`
                    : `No winner on ${last.drawnAt.toISOString().slice(0, 10)}`
                : '—';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT)
                .setTitle(`🎟️ Weekly Lottery`)
                .setDescription(`${discord_1.LINE}\nTickets accrue from the sources below and reset each draw.`)
                .addFields({ name: 'Status', value: onOff(cfg.lotteryEnabled), inline: true }, { name: 'Current Pot', value: `${pot.totalTickets} tickets · ${pot.participants} entrants`, inline: true }, { name: 'Prize', value: services.redemption.label(cfg.lotteryPrizeKey), inline: true }, { name: 'Per Daily', value: `${cfg.ticketsPerDaily}`, inline: true }, { name: 'Per Invite', value: `${cfg.ticketsPerInvite}`, inline: true }, { name: 'Per Ride', value: `${cfg.ticketsPerRide}`, inline: true }, { name: 'Per Event', value: `${cfg.ticketsPerEvent}`, inline: true }, { name: 'Last Draw', value: lastLine, inline: false });
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('lottery', 'lottery', 'Edit Lottery', discord_js_1.ButtonStyle.Primary), toggleBtn('lottery', 'lotteryEnabled', 'Toggle Lottery'), actionBtn('lottery', 'draw', 'Draw Now', discord_js_1.ButtonStyle.Danger)));
            break;
        }
        case 'shop': {
            const items = await services.shop.listAll(guildId);
            const rewardKeys = Object.keys(config_1.config.economy.rewardLabels);
            const list = items.length
                ? items
                    .map((it, i) => {
                    const selected = it.key === shopSelectedKey ? ' ◀' : '';
                    const desc = it.description ? `\n   _${it.description}_` : '';
                    return `\`${i + 1}\` \`${it.key}\` — **${it.label}** · ${discord_1.ICON.coin} ${it.priceRc} ${discord_1.BRAND.ticker} · \`${it.rewardKey}\`${it.enabled ? '' : ' _(disabled)_'}${desc}${selected}`;
                })
                    .join('\n\n')
                : '_No shop items configured._';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
                .setTitle(`🛒 Reward Shop`)
                .setDescription(`${discord_1.LINE}\nStatus: ${onOff(cfg.shopEnabled)}\n\n` +
                list +
                `\n\n**Known reward keys:** ${rewardKeys.map((k) => `\`${k}\``).join(', ')}`);
            if (items.length) {
                rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                    .setCustomId('invadm:shop:pick')
                    .setPlaceholder('Select an item to edit…')
                    .addOptions(items.slice(0, 25).map((it) => ({
                    label: it.label.slice(0, 100),
                    value: it.key,
                    description: `${it.priceRc} RC · ${it.rewardKey}`.slice(0, 100),
                    default: it.key === shopSelectedKey,
                })))));
            }
            if (shopSelectedKey) {
                const selected = items.find((i) => i.key === shopSelectedKey);
                if (selected) {
                    rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:edit:${shopSelectedKey}:label`)
                        .setLabel('Edit Label')
                        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:edit:${shopSelectedKey}:price`)
                        .setLabel('Edit Price')
                        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:itemtoggle:${shopSelectedKey}`)
                        .setLabel(selected.enabled ? 'Disable' : 'Enable')
                        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:itemremove:${shopSelectedKey}`)
                        .setLabel('Remove')
                        .setStyle(discord_js_1.ButtonStyle.Danger)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:itemup:${shopSelectedKey}`)
                        .setLabel('Move Up')
                        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
                        .setCustomId(`invadm:btn:shop:itemdown:${shopSelectedKey}`)
                        .setLabel('Move Down')
                        .setStyle(discord_js_1.ButtonStyle.Secondary)));
                }
            }
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('shop', 'shopadd', 'Add Item', discord_js_1.ButtonStyle.Success), toggleBtn('shop', 'shopEnabled', 'Toggle Shop')));
            break;
        }
        case 'milestones': {
            const milestones = await services.invite.admin.listMilestones(guildId);
            const list = milestones.length
                ? milestones
                    .map((m) => {
                    const parts = [];
                    if (m.rewardAmount > 0)
                        parts.push(`${discord_1.ICON.coin} ${m.rewardAmount} ${discord_1.BRAND.ticker}`);
                    if (m.rewardRideKey)
                        parts.push(services.redemption.label(m.rewardRideKey));
                    if (m.rewardRoleId)
                        parts.push(`<@&${m.rewardRoleId}>`);
                    if (m.rewardTickets > 0)
                        parts.push(`🎟️ ${m.rewardTickets}`);
                    return `**${m.threshold}** — ${m.label ?? 'Milestone'} · ${parts.join(' + ') || 'no reward'}${m.enabled ? '' : ' _(disabled)_'}`;
                })
                    .join('\n')
                : '_No milestones configured._';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT).setTitle(`${discord_1.ICON.jackpot} Milestones`).setDescription(`${discord_1.LINE}\n${list}`);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('milestones', 'milestoneadd', 'Add / Edit', discord_js_1.ButtonStyle.Success), modalBtn('milestones', 'milestoneremove', 'Remove', discord_js_1.ButtonStyle.Danger)));
            break;
        }
        case 'statistics': {
            const s = await services.invite.stats.getGuildStats(guildId);
            const top = s.topInviters.length
                ? s.topInviters.map((t, i) => `\`${i + 1}.\` <@${t.userId}> — ${t.verified} (${discord_1.ICON.coin} ${t.rcEarned})`).join('\n')
                : '—';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ACTIVE)
                .setTitle(`${discord_1.ICON.jackpot} Statistics`)
                .setDescription(discord_1.LINE)
                .addFields({ name: 'Total Joins', value: `${s.totalJoins}`, inline: true }, { name: 'Verified', value: `${s.verified}`, inline: true }, { name: 'Fake', value: `${s.fake}`, inline: true }, { name: 'Pending', value: `${s.pending}`, inline: true }, { name: 'Rewards Paid', value: `${s.rewardsPaid}`, inline: true }, { name: 'RC Distributed', value: `${s.rcDistributed}`, inline: true }, { name: 'Growth (24h/7d/30d)', value: `${s.dailyGrowth} / ${s.weeklyGrowth} / ${s.monthlyGrowth}`, inline: true }, { name: 'Avg Verify Time', value: s.avgVerificationMinutes != null ? `${s.avgVerificationMinutes} min` : '—', inline: true }, { name: 'Top Inviters', value: top, inline: false });
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(actionBtn('statistics', 'recalc', 'Recalculate Aggregates', discord_js_1.ButtonStyle.Secondary)));
            break;
        }
        case 'leaderboard': {
            const page = await services.invite.leaderboard.getPage(guildId, 1, 10, 'all');
            const body = page.entries.length
                ? page.entries.map((e) => `\`#${e.rank}\` <@${e.userId}> — **${e.verified}** · ${discord_1.ICON.coin} ${e.rcEarned}`).join('\n')
                : '_No data yet._';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ACTIVE).setTitle(`${discord_1.ICON.jackpot} Top Inviters`).setDescription(`${discord_1.LINE}\n${body}`);
            break;
        }
        case 'logs': {
            const recent = await services.invite.logging.recent(guildId, 15);
            const body = recent.length
                ? recent
                    .map((l) => `\`${l.createdAt.toISOString().slice(5, 16).replace('T', ' ')}\` **${l.event}**${l.targetUserId ? ` <@${l.targetUserId}>` : ''}${l.detail ? ` — ${l.detail}` : ''}`)
                    .join('\n')
                : '_No log entries yet._';
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.NEUTRAL).setTitle(`${discord_1.ICON.time} Recent Logs`).setDescription(`${discord_1.LINE}\n${body}`);
            break;
        }
        case 'exports': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
                .setTitle(`${discord_1.ICON.arrow} Exports`)
                .setDescription(`${discord_1.LINE}\nDownload invite data for analysis or backup.`);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId('invadm:btn:exports:export:csv').setLabel('Export CSV').setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId('invadm:btn:exports:export:json').setLabel('Export JSON').setStyle(discord_js_1.ButtonStyle.Secondary)));
            break;
        }
        case 'backup': {
            const verifiedCount = await prisma_1.prisma.memberVerification.count({ where: { guildId } });
            const urlConfigured = config_1.config.backup.serverInviteUrl ? `${discord_1.ICON.check} Set` : `${discord_1.ICON.cross} Not set (\`BACKUP_SERVER_INVITE_URL\`)`;
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
                .setTitle('🔗 Backup Server Pull')
                .setDescription(`${discord_1.LINE}\nDM all screener-verified members the backup server invite link (VaultCord-lite).\n\n` +
                `**Verified members:** ${verifiedCount}\n**Invite URL:** ${urlConfigured}`);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(actionBtn('backup', 'pullbackup', 'DM Backup Invite', discord_js_1.ButtonStyle.Primary)));
            break;
        }
        case 'manageuser': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
                .setTitle(`${discord_1.ICON.arrow} Manage User`)
                .setDescription(`${discord_1.LINE}\nPer-user overrides. Open the form and provide the fields for your action:\n\n` +
                '`give` — userId + amount\n' +
                '`resetuser` — userId\n' +
                '`recalc` — userId\n' +
                '`reverify` — joinId\n' +
                '`markfake` — joinId\n' +
                '`removereward` — joinId (claws back RC)');
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(modalBtn('manageuser', 'manageuser', 'Open Form', discord_js_1.ButtonStyle.Primary)));
            break;
        }
        case 'reset': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.LOSS)
                .setTitle(`${discord_1.ICON.time} Reset`)
                .setDescription(`${discord_1.LINE}\nEach action asks for confirmation. These do not refund RouteCash already paid.`);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(resetBtn('reset', 'weekly', 'Reset Weekly'), resetBtn('reset', 'monthly', 'Reset Monthly'), resetBtn('reset', 'leaderboard', 'Reset Leaderboard')), new discord_js_1.ActionRowBuilder().addComponents(resetBtn('reset', 'rewards', 'Clear Reward Log'), new discord_js_1.ButtonBuilder().setCustomId('invadm:btn:reset:reset:cache').setLabel('Re-prime Cache').setStyle(discord_js_1.ButtonStyle.Secondary)));
            break;
        }
        case 'danger': {
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.LOSS)
                .setTitle(`${discord_1.ICON.cross} Danger Zone`)
                .setDescription(`${discord_1.LINE}\n**Wipe ALL invite tracking data** for this server (joins, rewards, milestone awards, aggregates). Config and milestone definitions are kept. This cannot be undone.`);
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(resetBtn('danger', 'guild', 'WIPE ALL INVITE DATA')));
            break;
        }
        case 'overview':
        default: {
            const s = await services.invite.stats.getGuildStats(guildId);
            const pot = await services.lottery.getPot(guildId);
            embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.EPIC)
                .setTitle(`${discord_1.BRAND.logo} Referral Economy — Admin`)
                .setDescription(`${discord_1.LINE}\nUse the menu below to configure invites, milestones, the lottery, and the reward shop.`)
                .addFields({ name: 'Modules', value: `${onOff(cfg.rewardEnabled)} rewards · ${onOff(cfg.milestonesEnabled)} milestones · ${onOff(cfg.lotteryEnabled)} lottery · ${onOff(cfg.shopEnabled)} shop`, inline: false }, { name: 'Reward / Invite', value: `${cfg.rewardAmount} ${discord_1.BRAND.ticker}`, inline: true }, { name: 'Verify Delay', value: `${Math.round(cfg.verificationDelaySec / 60)} min`, inline: true }, { name: 'Min Age / Msgs', value: `${cfg.minAccountAgeDays}d / ${cfg.minMessages}`, inline: true }, { name: 'Verified', value: `${s.verified}`, inline: true }, { name: 'Pending', value: `${s.pending}`, inline: true }, { name: 'Fake', value: `${s.fake}`, inline: true }, { name: 'Lottery Pot', value: `${pot.totalTickets} tickets`, inline: true }, { name: 'Prize', value: services.redemption.label(cfg.lotteryPrizeKey), inline: true });
            break;
        }
    }
    return { embeds: [embed], components: rows };
}
function buildConfirmView(section, type) {
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.LOSS)
        .setTitle(`${discord_1.ICON.cross} Confirm: ${type}`)
        .setDescription(`${discord_1.LINE}\nAre you sure? This action cannot be undone.`);
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:confirm:${type}`).setLabel('CONFIRM').setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:cancel`).setLabel('CANCEL').setStyle(discord_js_1.ButtonStyle.Secondary));
    return { embeds: [embed], components: [row] };
}
// ── Button factories ─────────────────────────────────────────────────────---
function toggleBtn(section, field, label) {
    return new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:toggle:${field}`).setLabel(label).setStyle(discord_js_1.ButtonStyle.Secondary);
}
function modalBtn(section, modal, label, style) {
    return new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:modal:${modal}`).setLabel(label).setStyle(style);
}
function actionBtn(section, action, label, style) {
    return new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:${action}`).setLabel(label).setStyle(style);
}
function resetBtn(section, type, label) {
    return new discord_js_1.ButtonBuilder().setCustomId(`invadm:btn:${section}:reset:${type}`).setLabel(label).setStyle(discord_js_1.ButtonStyle.Danger);
}
// ── Modal builders ───────────────────────────────────────────────────────---
async function openShopEditModal(interaction, guildId, itemKey, field, services) {
    const item = (await services.shop.listAll(guildId)).find((i) => i.key === itemKey);
    if (!item) {
        await interaction.reply({ content: 'Item not found.', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    const input = (id, label, value) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(discord_js_1.TextInputStyle.Short).setRequired(true).setValue(value).setMaxLength(100));
    if (field === 'price') {
        const builder = new discord_js_1.ModalBuilder()
            .setCustomId('invadm:modal:shopeditprice')
            .setTitle(`Edit Price — ${itemKey}`)
            .addComponents(input('key', 'Item key', itemKey), input('priceRc', 'Price (RC)', String(item.priceRc)));
        await interaction.showModal(builder);
        return;
    }
    const builder = new discord_js_1.ModalBuilder()
        .setCustomId('invadm:modal:shopeditlabel')
        .setTitle(`Edit Label — ${itemKey}`)
        .addComponents(input('key', 'Item key', itemKey), input('label', 'Display label', item.label));
    await interaction.showModal(builder);
}
async function openSectionModal(interaction, modal, services) {
    const guildId = interaction.guildId;
    const cfg = await services.invite.admin.getConfig(guildId);
    const input = (id, label, value, required = false, style = discord_js_1.TextInputStyle.Short) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setValue(value).setMaxLength(100));
    let builder;
    switch (modal) {
        case 'rewards':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:rewards').setTitle('Reward Settings').addComponents(input('rewardAmount', 'Reward per invite (RC)', String(cfg.rewardAmount)), input('dailyCap', 'Daily cap (0 = unlimited)', String(cfg.dailyCap)), input('weeklyCap', 'Weekly cap (0 = unlimited)', String(cfg.weeklyCap)), input('monthlyCap', 'Monthly cap (0 = unlimited)', String(cfg.monthlyCap)), input('maxRewards', 'Max rewards per inviter (0 = ∞)', String(cfg.maxRewardsPerInviter)));
            break;
        case 'verification':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:verification').setTitle('Verification').addComponents(input('delaySec', 'Verification delay (seconds)', String(cfg.verificationDelaySec)), input('minAge', 'Min account age (days)', String(cfg.minAccountAgeDays)), input('minMessages', 'Min messages (0 = off)', String(cfg.minMessages)), input('maxAttempts', 'Max verify attempts', String(cfg.maxVerifyAttempts)));
            break;
        case 'channels':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:channels').setTitle('Channels').addComponents(input('logging', 'Logging channel ID (blank = off)', cfg.loggingChannelId ?? ''), input('announce', 'Announce channel ID (blank = off)', cfg.announceChannelId ?? ''), input('lottery', 'Lottery channel ID (blank = off)', cfg.lotteryChannelId ?? ''));
            break;
        case 'lottery':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:lottery').setTitle('Lottery Settings').addComponents(input('perDaily', 'Tickets per /daily', String(cfg.ticketsPerDaily)), input('perInvite', 'Tickets per verified invite', String(cfg.ticketsPerInvite)), input('perRide', 'Tickets per completed ride', String(cfg.ticketsPerRide)), input('perEvent', 'Tickets per event', String(cfg.ticketsPerEvent)), input('prizeKey', 'Prize reward key', cfg.lotteryPrizeKey));
            break;
        case 'shopadd':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:shopadd').setTitle('Add Shop Item').addComponents(input('key', 'Item key (unique)', '', true), input('label', 'Display label', '', true), input('priceRc', 'Price (RC)', '', true), input('rewardKey', `Reward key (${Object.keys(config_1.config.economy.rewardLabels).join(', ')})`, '', false), input('description', 'Description (optional)', ''));
            break;
        case 'shopremove':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:shopremove').setTitle('Remove Shop Item').addComponents(input('key', 'Item key to remove', '', true));
            break;
        case 'milestoneadd':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:milestoneadd').setTitle('Add / Edit Milestone').addComponents(input('threshold', 'Invite threshold', '', true), input('rewardAmount', 'Reward RC (0 = none)', '0'), input('roleId', 'Reward role ID (optional)', ''), input('rideKey', 'Ride reward key (optional)', ''), input('tickets', 'Lottery tickets (0 = none)', '0'));
            break;
        case 'milestoneremove':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:milestoneremove').setTitle('Remove Milestone').addComponents(input('threshold', 'Invite threshold to remove', '', true));
            break;
        case 'manageuser':
            builder = new discord_js_1.ModalBuilder().setCustomId('invadm:modal:manageuser').setTitle('Manage User').addComponents(input('action', 'Action (give/resetuser/recalc/...)', '', true), input('userId', 'User ID (for user actions)', ''), input('joinId', 'Join ID (for join actions)', ''), input('amount', 'Amount (for give)', ''));
            break;
        default:
            await interaction.reply({ content: 'Unknown form.', flags: discord_js_1.MessageFlags.Ephemeral });
            return;
    }
    await interaction.showModal(builder);
}
