"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
client.once('ready', () => {
    console.log(`✓ Bot logged in as ${client.user?.tag}`);
});
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    console.log(`Command: ${interaction.commandName}`);
});
client.login(process.env.DISCORD_TOKEN);
//# sourceMappingURL=index.js.map