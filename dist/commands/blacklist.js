"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.handleBlacklist = handleBlacklist;
const discord_js_1 = require("discord.js");
const discord_1 = require("../utils/discord");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage booking blacklist (staff only)')
    .addSubcommand((s) => s
    .setName('add')
    .setDescription('Add a user to the booking blacklist')
    .addUserOption((o) => o.setName('user').setDescription('User to blacklist').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand((s) => s
    .setName('remove')
    .setDescription('Remove a user from the booking blacklist')
    .addUserOption((o) => o.setName('user').setDescription('User to unblacklist').setRequired(true)));
async function handleBlacklist(interaction, services) {
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'Only staff can manage the blacklist.');
        return;
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user', true);
    if (sub === 'add') {
        const reason = interaction.options.getString('reason') ?? undefined;
        await services.blacklist.add(target.id, interaction.user.id, reason);
        await (0, discord_1.ephemeralReply)(interaction, `<@${target.id}> has been added to the booking blacklist.`);
        return;
    }
    const removed = await services.blacklist.remove(target.id);
    await (0, discord_1.ephemeralReply)(interaction, removed
        ? `<@${target.id}> has been removed from the booking blacklist.`
        : `<@${target.id}> was not on the blacklist.`);
}
