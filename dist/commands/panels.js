"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderPanelData = exports.howtoData = exports.inviteData = void 0;
exports.handleInvite = handleInvite;
exports.handleHowto = handleHowto;
exports.publishPanel = publishPanel;
exports.handlePanelModal = handlePanelModal;
exports.handleOrderPanel = handleOrderPanel;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = require("../lib/prisma");
const bookingEmbeds_1 = require("../utils/bookingEmbeds");
const discord_1 = require("../utils/discord");
const PANEL_MODAL_PREFIX = 'panel-edit';
const PANEL_META = {
    invite: {
        title: 'How Invites Work',
        icon: '🎟️',
        color: discord_1.COLOR.EPIC,
        withBookButton: false,
        default: [
            '**Invite friends, earn rewards.**',
            '',
            '• Share your personal invite link to bring people into the server.',
            '• Each verified member you invite counts toward your milestones.',
            '• Hit a milestone and Route Cash rewards are credited automatically.',
            '• Check progress with `/invites` or the leaderboard with `/invite-leaderboard`.',
            '',
            '_Fake, self, or rejoining invites do not count._',
            '',
            'Staff can edit this panel with `/invitepanel`.',
        ].join('\n'),
    },
    howto: {
        title: 'How To Order',
        icon: '📖',
        color: discord_1.COLOR.ELECTRIC,
        withBookButton: true,
        default: [
            '**Ordering a ride or delivery is easy.**',
            '',
            '**Option 1 — Slash command**',
            'Type `/book` anywhere and follow the prompts.',
            '',
            '**Option 2 — Button**',
            'Tap the **Book Now** button in the order channel.',
            '',
            'You will choose your service, vehicle, and paste your pickup & dropoff',
            'Google Maps links. A private ticket opens with a provider.',
            '',
            'Staff can edit this panel with `/howto`.',
        ].join('\n'),
    },
};
exports.inviteData = new discord_js_1.SlashCommandBuilder()
    .setName('invitepanel')
    .setDescription('Post or edit the invites info panel (staff only)');
exports.howtoData = new discord_js_1.SlashCommandBuilder()
    .setName('howto')
    .setDescription('Post or edit the how-to-order panel (staff only)');
exports.orderPanelData = new discord_js_1.SlashCommandBuilder()
    .setName('orderpanel')
    .setDescription('Post / refresh the Book Now button in the order channel (staff only)');
function panelModal(key, current) {
    const meta = PANEL_META[key];
    return new discord_js_1.ModalBuilder()
        .setCustomId(`${PANEL_MODAL_PREFIX}:${key}`)
        .setTitle(`Edit: ${meta.title}`.slice(0, 45))
        .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('content')
        .setLabel('Panel text (Markdown supported)')
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(3500)
        .setValue(current.slice(0, 3500))));
}
async function openPanelEditor(interaction, key) {
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be staff to manage this panel.');
        return;
    }
    const existing = await prisma_1.prisma.panel.findUnique({ where: { key } });
    const current = existing?.content ?? PANEL_META[key].default;
    await interaction.showModal(panelModal(key, current));
}
async function handleInvite(interaction) {
    await openPanelEditor(interaction, 'invite');
}
async function handleHowto(interaction) {
    await openPanelEditor(interaction, 'howto');
}
function buildPanelMessage(key, content) {
    const meta = PANEL_META[key];
    const embed = (0, bookingEmbeds_1.buildInfoPanelEmbed)(meta.title, meta.icon, content, meta.color);
    const components = meta.withBookButton ? [(0, bookingEmbeds_1.buildOrderPanelRow)()] : [];
    return { embed, components };
}
/** Edit the existing panel message if present; otherwise post a fresh one. */
async function publishPanel(client, key, channelId, embed, components) {
    const existing = await prisma_1.prisma.panel.findUnique({ where: { key } });
    if (existing?.messageId && existing.channelId) {
        try {
            const ch = await client.channels.fetch(existing.channelId);
            if (ch?.isTextBased() && !ch.isDMBased()) {
                const msg = await ch.messages.fetch(existing.messageId);
                await msg.edit({ embeds: [embed], components });
                if (existing.channelId !== channelId) {
                    await prisma_1.prisma.panel.update({ where: { key }, data: { channelId: existing.channelId } });
                }
                return;
            }
        }
        catch {
            /* message was deleted — fall through and post a new one */
        }
    }
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased() || ch.isDMBased()) {
        throw new Error('Target channel is not a text channel.');
    }
    const msg = await ch.send({ embeds: [embed], components });
    await prisma_1.prisma.panel.update({ where: { key }, data: { channelId, messageId: msg.id } });
}
async function handlePanelModal(interaction) {
    if (!interaction.customId.startsWith(`${PANEL_MODAL_PREFIX}:`))
        return;
    const key = interaction.customId.split(':')[1];
    if (!PANEL_META[key])
        return;
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const content = interaction.fields.getTextInputValue('content').trim();
    const channelId = interaction.channelId;
    if (!channelId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Could not determine the target channel.');
        return;
    }
    await prisma_1.prisma.panel.upsert({
        where: { key },
        create: { key, content, channelId },
        update: { content, channelId },
    });
    const { embed, components } = buildPanelMessage(key, content);
    try {
        await publishPanel(interaction.client, key, channelId, embed, components);
        await (0, discord_1.ephemeralReply)(interaction, `**${PANEL_META[key].title}** panel updated in this channel.`);
    }
    catch (err) {
        console.error('[Bot] Failed to publish panel:', err);
        await (0, discord_1.ephemeralReply)(interaction, 'Saved, but failed to post the panel here. Check my permissions.');
    }
}
async function handleOrderPanel(interaction) {
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be staff to manage this panel.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const channelId = config_1.config.channels.orderHere;
    if (!channelId || channelId === '0') {
        await (0, discord_1.ephemeralReply)(interaction, 'Order channel is not configured (ORDER_CHANNEL_ID).');
        return;
    }
    try {
        await publishPanel(interaction.client, 'order', channelId, (0, bookingEmbeds_1.buildOrderPanelEmbed)(), [(0, bookingEmbeds_1.buildOrderPanelRow)()]);
        await (0, discord_1.ephemeralReply)(interaction, `Book Now panel posted in <#${channelId}>.`);
    }
    catch (err) {
        console.error('[Bot] Failed to publish order panel:', err);
        await (0, discord_1.ephemeralReply)(interaction, 'Failed to post the order panel. Check my permissions in that channel.');
    }
}
