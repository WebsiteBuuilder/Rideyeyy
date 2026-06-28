"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopAdminData = exports.PICK_ID = void 0;
exports.handleShopAdmin = handleShopAdmin;
exports.handleShopAdminSelect = handleShopAdminSelect;
exports.handleShopAdminButton = handleShopAdminButton;
exports.handleShopAdminModal = handleShopAdminModal;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const discord_1 = require("../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  /shopadmin — dedicated reward shop management (separate from /admin economy)
// ═══════════════════════════════════════════════════════════════════════════
exports.PICK_ID = 'shopadm:pick';
const MODAL_PREFIX = 'shopadm:modal:';
const BTN_PREFIX = 'shopadm:btn:';
exports.shopAdminData = new discord_js_1.SlashCommandBuilder()
    .setName('shopadmin')
    .setDescription('Manage the reward shop — items, prices, and visibility')
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator);
function isAdmin(interaction) {
    if (!interaction.inGuild())
        return false;
    return interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ?? false;
}
function onOff(v) {
    return v ? `${discord_1.ICON.check} On` : `${discord_1.ICON.cross} Off`;
}
async function renderView(guildId, services, selectedKey) {
    const cfg = await services.invite.admin.getConfig(guildId);
    const items = await services.shop.listAll(guildId);
    const rewardKeys = Object.keys(config_1.config.economy.rewardLabels);
    const list = items.length
        ? items
            .map((it, i) => {
            const selected = it.key === selectedKey ? ' ◀' : '';
            const desc = it.description ? `\n   _${it.description}_` : '';
            return `\`${i + 1}\` \`${it.key}\` — **${it.label}** · ${discord_1.ICON.coin} ${it.priceRc} ${discord_1.BRAND.ticker} · \`${it.rewardKey}\`${it.enabled ? '' : ' _(disabled)_'}${desc}${selected}`;
        })
            .join('\n\n')
        : '_No shop items yet — use **Add Item** below._';
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle('🛒 Shop Admin')
        .setDescription(`${discord_1.LINE}\nShop: ${onOff(cfg.shopEnabled)}\n\n` +
        list +
        `\n\n**Reward keys:** ${rewardKeys.map((k) => `\`${k}\``).join(', ')}`);
    const rows = [];
    if (items.length) {
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(exports.PICK_ID)
            .setPlaceholder('Select an item to edit…')
            .addOptions(items.slice(0, 25).map((it) => ({
            label: it.label.slice(0, 100),
            value: it.key,
            description: `${it.priceRc} RC · ${it.rewardKey}`.slice(0, 100),
            default: it.key === selectedKey,
        })))));
    }
    if (selectedKey) {
        const selected = items.find((i) => i.key === selectedKey);
        if (selected) {
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}editlabel:${selectedKey}`)
                .setLabel('Edit Label')
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}editprice:${selectedKey}`)
                .setLabel('Edit Price')
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}toggle:${selectedKey}`)
                .setLabel(selected.enabled ? 'Disable' : 'Enable')
                .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}remove:${selectedKey}`)
                .setLabel('Remove')
                .setStyle(discord_js_1.ButtonStyle.Danger)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}up:${selectedKey}`)
                .setLabel('Move Up')
                .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
                .setCustomId(`${BTN_PREFIX}down:${selectedKey}`)
                .setLabel('Move Down')
                .setStyle(discord_js_1.ButtonStyle.Secondary)));
        }
    }
    rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`${BTN_PREFIX}add`)
        .setLabel('Add Item')
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId(`${BTN_PREFIX}toggleshop`)
        .setLabel(cfg.shopEnabled ? 'Disable Shop' : 'Enable Shop')
        .setStyle(discord_js_1.ButtonStyle.Secondary)));
    return { embeds: [embed], components: rows };
}
async function handleShopAdmin(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You need Administrator permission to use this.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const view = await renderView(interaction.guildId, services);
    await interaction.editReply(view);
}
async function handleShopAdminSelect(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction))
        return;
    if (interaction.customId !== exports.PICK_ID)
        return;
    const view = await renderView(interaction.guildId, services, interaction.values[0]);
    await interaction.update(view);
}
async function handleShopAdminButton(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Administrator only.', flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    if (!interaction.customId.startsWith(BTN_PREFIX))
        return;
    const guildId = interaction.guildId;
    const rest = interaction.customId.slice(BTN_PREFIX.length);
    if (rest === 'add') {
        const rewardHint = Object.keys(config_1.config.economy.rewardLabels).join(', ');
        const input = (id, label, placeholder = '', required = false) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
            .setCustomId(id)
            .setLabel(label.slice(0, 45))
            .setStyle(discord_js_1.TextInputStyle.Short)
            .setRequired(required)
            .setPlaceholder(placeholder)
            .setMaxLength(100));
        await interaction.showModal(new discord_js_1.ModalBuilder()
            .setCustomId(`${MODAL_PREFIX}add`)
            .setTitle('Add Shop Item')
            .addComponents(input('key', 'Item key (unique)', 'RIDE_FREE_20', true), input('label', 'Display label', 'FREE $20 Ride', true), input('priceRc', 'Price (RC)', '2000', true), input('rewardKey', 'Reward key', rewardHint), input('description', 'Description (optional)', 'One free ride up to $20')));
        return;
    }
    if (rest === 'toggleshop') {
        await interaction.deferUpdate();
        const cfg = await services.invite.admin.getConfig(guildId);
        await services.invite.admin.updateConfig(guildId, { shopEnabled: !cfg.shopEnabled });
        const view = await renderView(guildId, services);
        await interaction.editReply(view);
        return;
    }
    const [action, itemKey] = rest.split(':');
    if (!itemKey)
        return;
    if (action === 'editlabel' || action === 'editprice') {
        const item = (await services.shop.listAll(guildId)).find((i) => i.key === itemKey);
        if (!item) {
            await interaction.reply({ content: 'Item not found.', flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const input = (id, label, value) => new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(discord_js_1.TextInputStyle.Short).setRequired(true).setValue(value).setMaxLength(100));
        if (action === 'editprice') {
            await interaction.showModal(new discord_js_1.ModalBuilder()
                .setCustomId(`${MODAL_PREFIX}editprice`)
                .setTitle(`Edit Price — ${itemKey}`)
                .addComponents(input('key', 'Item key', itemKey), input('priceRc', 'Price (RC)', String(item.priceRc))));
            return;
        }
        await interaction.showModal(new discord_js_1.ModalBuilder()
            .setCustomId(`${MODAL_PREFIX}editlabel`)
            .setTitle(`Edit Label — ${itemKey}`)
            .addComponents(input('key', 'Item key', itemKey), input('label', 'Display label', item.label)));
        return;
    }
    await interaction.deferUpdate();
    if (action === 'toggle') {
        await services.shop.toggleItem(guildId, itemKey);
        const view = await renderView(guildId, services, itemKey);
        await interaction.editReply(view);
        return;
    }
    if (action === 'remove') {
        await services.shop.removeItem(guildId, itemKey);
        const view = await renderView(guildId, services);
        await interaction.editReply(view);
        return;
    }
    if (action === 'up') {
        await services.shop.moveItem(guildId, itemKey, -1);
        const view = await renderView(guildId, services, itemKey);
        await interaction.editReply(view);
        return;
    }
    if (action === 'down') {
        await services.shop.moveItem(guildId, itemKey, 1);
        const view = await renderView(guildId, services, itemKey);
        await interaction.editReply(view);
        return;
    }
}
async function handleShopAdminModal(interaction, services) {
    if (!interaction.guildId || !isAdmin(interaction))
        return;
    if (!interaction.customId.startsWith(MODAL_PREFIX))
        return;
    const guildId = interaction.guildId;
    const action = interaction.customId.slice(MODAL_PREFIX.length);
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
        case 'add': {
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
            await (0, discord_1.ephemeralReply)(interaction, `Shop item **${label}** saved (${Math.round(priceRc)} ${discord_1.BRAND.ticker}). Run \`/shopadmin\` again to refresh the panel.`);
            return;
        }
        case 'editlabel': {
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
            await (0, discord_1.ephemeralReply)(interaction, `Updated label for **${key}**. Run \`/shopadmin\` to refresh.`);
            return;
        }
        case 'editprice': {
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
            await (0, discord_1.ephemeralReply)(interaction, `Updated price for **${key}** (${Math.round(priceRc)} ${discord_1.BRAND.ticker}). Run \`/shopadmin\` to refresh.`);
            return;
        }
        default:
            await (0, discord_1.ephemeralReply)(interaction, 'Unknown action.');
    }
}
