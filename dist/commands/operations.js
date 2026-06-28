"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeData = exports.openData = void 0;
exports.handleOpen = handleOpen;
exports.handleClose = handleClose;
const discord_js_1 = require("discord.js");
const discord_1 = require("../utils/discord");
exports.openData = new discord_js_1.SlashCommandBuilder()
    .setName('open')
    .setDescription('Open bookings and show the green category (staff only)');
exports.closeData = new discord_js_1.SlashCommandBuilder()
    .setName('close')
    .setDescription('Close bookings and show the red category (staff only)');
async function requireStaff(interaction) {
    if (!interaction.inGuild()) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return false;
    }
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be staff to use this command.');
        return false;
    }
    return true;
}
async function handleOpen(interaction, services) {
    if (!(await requireStaff(interaction)))
        return;
    await interaction.deferReply({ flags: 64 });
    await services.operations.setBookingsOpen(interaction.guild, true);
    await interaction.editReply('Bookings are now **OPEN**. New `/book` and Book Now orders are accepted.');
}
async function handleClose(interaction, services) {
    if (!(await requireStaff(interaction)))
        return;
    await interaction.deferReply({ flags: 64 });
    await services.operations.setBookingsOpen(interaction.guild, false);
    await interaction.editReply('Bookings are now **CLOSED**. The category shows red until you `/open` again.');
}
