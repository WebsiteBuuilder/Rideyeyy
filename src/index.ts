import { Client, GatewayIntentBits, Collection } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✓ Bot logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  console.log(`Command: ${interaction.commandName}`);
});

client.login(process.env.DISCORD_TOKEN);

