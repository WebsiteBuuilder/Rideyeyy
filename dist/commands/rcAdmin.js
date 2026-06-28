"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rcData = void 0;
exports.handleRc = handleRc;
const discord_js_1 = require("discord.js");
const decimal_js_1 = __importDefault(require("decimal.js"));
const wallet_1 = require("../lib/wallet");
const discord_1 = require("../utils/discord");
const discord_js_2 = require("discord.js");
// ═══════════════════════════════════════════════════════════════════════════
//  /rc give · /rc take — staff Route Cash adjustments (separate from invites)
// ═══════════════════════════════════════════════════════════════════════════
exports.rcData = new discord_js_1.SlashCommandBuilder()
    .setName('rc')
    .setDescription('Staff Route Cash management')
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
    .setName('give')
    .setDescription('Grant Route Cash to a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to credit').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount of RC to grant').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('reason').setDescription('Optional note for the audit log')))
    .addSubcommand((sub) => sub
    .setName('take')
    .setDescription('Remove Route Cash from a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to debit').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount of RC to remove').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('reason').setDescription('Optional note for the audit log')));
async function handleRc(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const member = interaction.member;
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'Only staff can adjust Route Cash balances.');
        return;
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason')?.trim();
    const staffTag = interaction.user.tag;
    await interaction.deferReply({ flags: 64 });
    try {
        if (sub === 'give') {
            const detail = reason ?? `Granted by ${staffTag}`;
            await (0, wallet_1.adjustBalanceTx)(target.id, new decimal_js_1.default(amount), 'admin_grant', detail);
            await services.invite.logging.log({
                guildId,
                event: 'RC_GRANT',
                actorId: interaction.user.id,
                targetUserId: target.id,
                detail: `+${amount} ${discord_1.BRAND.ticker}${reason ? ` — ${reason}` : ''}`,
            });
            const embed = new discord_js_2.EmbedBuilder()
                .setColor(discord_1.COLOR.WIN)
                .setTitle(`${discord_1.ICON.check} Route Cash granted`)
                .setDescription(`Credited **${amount}** ${discord_1.BRAND.ticker} to <@${target.id}>.\n${reason ? `_Reason: ${reason}_` : ''}`)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        const detail = reason ?? `Deducted by ${staffTag}`;
        await (0, wallet_1.adjustBalanceTx)(target.id, new decimal_js_1.default(-amount), 'admin_deduct', detail);
        await services.invite.logging.log({
            guildId,
            event: 'RC_DEDUCT',
            actorId: interaction.user.id,
            targetUserId: target.id,
            detail: `-${amount} ${discord_1.BRAND.ticker}${reason ? ` — ${reason}` : ''}`,
        });
        const embed = new discord_js_2.EmbedBuilder()
            .setColor(discord_1.COLOR.INFO)
            .setTitle(`${discord_1.ICON.arrow} Route Cash removed`)
            .setDescription(`Debited **${amount}** ${discord_1.BRAND.ticker} from <@${target.id}>.\n${reason ? `_Reason: ${reason}_` : ''}`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (err) {
        if (err instanceof wallet_1.InsufficientFundsError) {
            await interaction.editReply({ content: `<@${target.id}> does not have enough ${discord_1.BRAND.ticker} for that deduction.` });
            return;
        }
        console.error('[RC] adjustment failed:', err);
        await interaction.editReply({ content: 'Failed to adjust balance. Please try again.' });
    }
}
