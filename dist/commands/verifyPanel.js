"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPanelData = void 0;
exports.handleVerifyPanel = handleVerifyPanel;
exports.ensureVerifyPanel = ensureVerifyPanel;
exports.handleVerifyButton = handleVerifyButton;
exports.handleVerifyModal = handleVerifyModal;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const prisma_1 = require("../lib/prisma");
const discord_1 = require("../utils/discord");
const panels_1 = require("./panels");
// ═══════════════════════════════════════════════════════════════════════════
//  VERIFY PANEL — one-time captcha screener in #verify
// ═══════════════════════════════════════════════════════════════════════════
const PANEL_KEY = 'verify';
const BTN_START = 'gudhrides-verify:start';
const MODAL_ID = 'gudhrides-verify:modal';
const DEFAULT_CONTENT = [
    '**Welcome — verify to access the server.**',
    '',
    'Click **Verify** below and solve a quick math captcha.',
    'Once verified you receive the **Rider** role and full channel access.',
    '',
    '_One attempt per account. Invited members credit their inviter on verify._',
].join('\n');
exports.verifyPanelData = new discord_js_1.SlashCommandBuilder()
    .setName('verifypanel')
    .setDescription('Post or refresh the member verification panel (staff only)');
function buildVerifyEmbed(content) {
    return new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.ELECTRIC)
        .setAuthor({ name: `${discord_1.BRAND.logo}  Member Verification` })
        .setTitle(`${discord_1.ICON.check} Verify Your Account`)
        .setDescription(content)
        .setTimestamp();
}
function buildVerifyRow() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(BTN_START).setLabel('Verify').setStyle(discord_js_1.ButtonStyle.Success).setEmoji('✅'));
}
async function handleVerifyPanel(interaction) {
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be staff to manage this panel.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const channelId = config_1.config.channels.verify;
    if (!channelId || channelId === '0') {
        await (0, discord_1.ephemeralReply)(interaction, 'Verify channel is not configured (VERIFY_CHANNEL_ID).');
        return;
    }
    try {
        await ensureVerifyPanel(interaction.client, channelId);
        await (0, discord_1.ephemeralReply)(interaction, `Verification panel posted in <#${channelId}>.`);
    }
    catch (err) {
        console.error('[Bot] Failed to publish verify panel:', err);
        await (0, discord_1.ephemeralReply)(interaction, 'Failed to post the verify panel. Check my permissions in that channel.');
    }
}
/** Auto-post verify panel on boot if missing or message deleted. */
async function ensureVerifyPanel(client, channelId) {
    const target = channelId ?? config_1.config.channels.verify;
    if (!target || target === '0')
        return;
    const existing = await prisma_1.prisma.panel.findUnique({ where: { key: PANEL_KEY } });
    const content = existing?.content ?? DEFAULT_CONTENT;
    await prisma_1.prisma.panel.upsert({
        where: { key: PANEL_KEY },
        create: { key: PANEL_KEY, content, channelId: target },
        update: { channelId: target },
    });
    await (0, panels_1.publishPanel)(client, PANEL_KEY, target, buildVerifyEmbed(content), [buildVerifyRow()]);
}
async function handleVerifyButton(interaction, services) {
    if (!interaction.inGuild() || !interaction.member)
        return;
    const question = services.memberVerify.buildCaptchaPrompt(interaction.user.id);
    const modal = new discord_js_1.ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('Verification Captcha')
        .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('answer')
        .setLabel(question.slice(0, 45))
        .setPlaceholder('Enter the number')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(4)));
    await interaction.showModal(modal);
}
async function handleVerifyModal(interaction, services) {
    if (!interaction.inGuild() || !interaction.member || interaction.member.user.bot)
        return;
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const answer = interaction.fields.getTextInputValue('answer');
    const member = interaction.member;
    if (!('guild' in member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'Could not resolve your membership.');
        return;
    }
    try {
        const result = await services.memberVerify.completeCaptcha(interaction.client, member, answer);
        if (!result.ok) {
            await (0, discord_1.ephemeralReply)(interaction, result.message);
            return;
        }
        if (result.alreadyVerified) {
            await (0, discord_1.ephemeralReply)(interaction, 'You are already verified.');
            return;
        }
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.check} Verified! You now have full server access.`);
    }
    catch (err) {
        console.error('[Verify] completeCaptcha error:', err);
        await (0, discord_1.ephemeralReply)(interaction, 'Verification failed due to an internal error. Contact staff.');
    }
}
