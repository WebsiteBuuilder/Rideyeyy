import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { AppServices } from '../types';
import { config } from '../config';
import { COLOR, BRAND, ICON, LINE, brandedEmbed, ephemeralReply } from '../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  /shopadmin — dedicated reward shop management (separate from /admin economy)
// ═══════════════════════════════════════════════════════════════════════════

export const PICK_ID = 'shopadm:pick';
const MODAL_PREFIX = 'shopadm:modal:';
const BTN_PREFIX = 'shopadm:btn:';

export const shopAdminData = new SlashCommandBuilder()
  .setName('shopadmin')
  .setDescription('Manage the reward shop — items, prices, and visibility')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function isAdmin(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction
): boolean {
  if (!interaction.inGuild()) return false;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function onOff(v: boolean): string {
  return v ? `${ICON.check} On` : `${ICON.cross} Off`;
}

async function renderView(
  guildId: string,
  services: AppServices,
  selectedKey?: string
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] }> {
  const cfg = await services.invite.admin.getConfig(guildId);
  const items = await services.shop.listAll(guildId);
  const rewardKeys = Object.keys(config.economy.rewardLabels);

  const list = items.length
    ? items
        .map((it, i) => {
          const selected = it.key === selectedKey ? ' ◀' : '';
          const desc = it.description ? `\n   _${it.description}_` : '';
          return `\`${i + 1}\` \`${it.key}\` — **${it.label}** · ${ICON.coin} ${it.priceRc} ${BRAND.ticker} · \`${it.rewardKey}\`${it.enabled ? '' : ' _(disabled)_'}${desc}${selected}`;
        })
        .join('\n\n')
    : '_No shop items yet — use **Add Item** below._';

  const embed = brandedEmbed(COLOR.WIN)
    .setTitle('🛒 Shop Admin')
    .setDescription(
      `${LINE}\nShop: ${onOff(cfg.shopEnabled)}\n\n` +
        list +
        `\n\n**Reward keys:** ${rewardKeys.map((k) => `\`${k}\``).join(', ')}`
    );

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (items.length) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(PICK_ID)
          .setPlaceholder('Select an item to edit…')
          .addOptions(
            items.slice(0, 25).map((it) => ({
              label: it.label.slice(0, 100),
              value: it.key,
              description: `${it.priceRc} RC · ${it.rewardKey}`.slice(0, 100),
              default: it.key === selectedKey,
            }))
          )
      )
    );
  }

  if (selectedKey) {
    const selected = items.find((i) => i.key === selectedKey);
    if (selected) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}editlabel:${selectedKey}`)
            .setLabel('Edit Label')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}editprice:${selectedKey}`)
            .setLabel('Edit Price')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}toggle:${selectedKey}`)
            .setLabel(selected.enabled ? 'Disable' : 'Enable')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}remove:${selectedKey}`)
            .setLabel('Remove')
            .setStyle(ButtonStyle.Danger)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}up:${selectedKey}`)
            .setLabel('Move Up')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`${BTN_PREFIX}down:${selectedKey}`)
            .setLabel('Move Down')
            .setStyle(ButtonStyle.Secondary)
        )
      );
    }
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BTN_PREFIX}add`)
        .setLabel('Add Item')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BTN_PREFIX}toggleshop`)
        .setLabel(cfg.shopEnabled ? 'Disable Shop' : 'Enable Shop')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: rows };
}

export async function handleShopAdmin(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) {
    await ephemeralReply(interaction, 'You need Administrator permission to use this.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const view = await renderView(interaction.guildId, services);
  await interaction.editReply(view);
}

export async function handleShopAdminSelect(
  interaction: StringSelectMenuInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) return;
  if (interaction.customId !== PICK_ID) return;
  const view = await renderView(interaction.guildId, services, interaction.values[0]);
  await interaction.update(view);
}

export async function handleShopAdminButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) {
    await interaction.reply({ content: 'Administrator only.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.customId.startsWith(BTN_PREFIX)) return;

  const guildId = interaction.guildId;
  const rest = interaction.customId.slice(BTN_PREFIX.length);

  if (rest === 'add') {
    const rewardHint = Object.keys(config.economy.rewardLabels).join(', ');
    const input = (id: string, label: string, placeholder = '', required = false): ActionRowBuilder<TextInputBuilder> =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(required)
          .setPlaceholder(placeholder)
          .setMaxLength(100)
      );
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}add`)
        .setTitle('Add Shop Item')
        .addComponents(
          input('key', 'Item key (unique)', 'RIDE_FREE_20', true),
          input('label', 'Display label', 'FREE $20 Ride', true),
          input('priceRc', 'Price (RC)', '2000', true),
          input('rewardKey', 'Reward key', rewardHint),
          input('description', 'Description (optional)', 'One free ride up to $20')
        )
    );
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
  if (!itemKey) return;

  if (action === 'editlabel' || action === 'editprice') {
    const item = (await services.shop.listAll(guildId)).find((i) => i.key === itemKey);
    if (!item) {
      await interaction.reply({ content: 'Item not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const input = (id: string, label: string, value: string): ActionRowBuilder<TextInputBuilder> =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true).setValue(value).setMaxLength(100)
      );
    if (action === 'editprice') {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${MODAL_PREFIX}editprice`)
          .setTitle(`Edit Price — ${itemKey}`)
          .addComponents(input('key', 'Item key', itemKey), input('priceRc', 'Price (RC)', String(item.priceRc)))
      );
      return;
    }
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}editlabel`)
        .setTitle(`Edit Label — ${itemKey}`)
        .addComponents(input('key', 'Item key', itemKey), input('label', 'Display label', item.label))
    );
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

export async function handleShopAdminModal(
  interaction: ModalSubmitInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) return;
  if (!interaction.customId.startsWith(MODAL_PREFIX)) return;

  const guildId = interaction.guildId;
  const action = interaction.customId.slice(MODAL_PREFIX.length);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const num = (id: string): number | null => {
    const raw = interaction.fields.getTextInputValue(id).trim();
    if (raw === '') return null;
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const str = (id: string): string => interaction.fields.getTextInputValue(id).trim();

  switch (action) {
    case 'add': {
      const key = str('key').toUpperCase();
      const label = str('label');
      const priceRc = num('priceRc');
      const rewardKey = str('rewardKey').toUpperCase() || key;
      const description = str('description') || null;
      if (!key || !label || priceRc == null || priceRc < 0) {
        await ephemeralReply(interaction, 'Key, label, and a non-negative price are required.');
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
      await ephemeralReply(interaction, `Shop item **${label}** saved (${Math.round(priceRc)} ${BRAND.ticker}). Run \`/shopadmin\` again to refresh the panel.`);
      return;
    }
    case 'editlabel': {
      const key = str('key').toUpperCase();
      const label = str('label');
      if (!key || !label) {
        await ephemeralReply(interaction, 'Key and label are required.');
        return;
      }
      const item = (await services.shop.listAll(guildId)).find((i) => i.key === key);
      if (!item) {
        await ephemeralReply(interaction, 'Item not found.');
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
      await ephemeralReply(interaction, `Updated label for **${key}**. Run \`/shopadmin\` to refresh.`);
      return;
    }
    case 'editprice': {
      const key = str('key').toUpperCase();
      const priceRc = num('priceRc');
      if (!key || priceRc == null || priceRc < 0) {
        await ephemeralReply(interaction, 'Key and a non-negative price are required.');
        return;
      }
      const item = (await services.shop.listAll(guildId)).find((i) => i.key === key);
      if (!item) {
        await ephemeralReply(interaction, 'Item not found.');
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
      await ephemeralReply(interaction, `Updated price for **${key}** (${Math.round(priceRc)} ${BRAND.ticker}). Run \`/shopadmin\` to refresh.`);
      return;
    }
    default:
      await ephemeralReply(interaction, 'Unknown action.');
  }
}
