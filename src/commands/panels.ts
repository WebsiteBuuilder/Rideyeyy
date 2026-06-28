import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import {
  buildInfoPanelEmbed,
  buildOrderPanelEmbed,
  buildOrderPanelRow,
} from '../utils/bookingEmbeds';
import {
  COLOR,
  ephemeralReply,
  hasStaffRole,
  memberFromInteraction,
} from '../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  EDITABLE INFO PANELS: /invite, /howto  +  /orderpanel (Book Now button)
// ═══════════════════════════════════════════════════════════════════════════

type PanelKey = 'invite' | 'howto';

const PANEL_MODAL_PREFIX = 'panel-edit';

const PANEL_META: Record<PanelKey, { title: string; icon: string; color: number; withBookButton: boolean; default: string }> = {
  invite: {
    title: 'How Invites Work',
    icon: '🎟️',
    color: COLOR.EPIC,
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
    color: COLOR.ELECTRIC,
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

export const inviteData = new SlashCommandBuilder()
  .setName('invitepanel')
  .setDescription('Post or edit the invites info panel (staff only)');

export const howtoData = new SlashCommandBuilder()
  .setName('howto')
  .setDescription('Post or edit the how-to-order panel (staff only)');

export const orderPanelData = new SlashCommandBuilder()
  .setName('orderpanel')
  .setDescription('Post / refresh the Book Now button in the order channel (staff only)');

function panelModal(key: PanelKey, current: string): ModalBuilder {
  const meta = PANEL_META[key];
  return new ModalBuilder()
    .setCustomId(`${PANEL_MODAL_PREFIX}:${key}`)
    .setTitle(`Edit: ${meta.title}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Panel text (Markdown supported)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(3500)
          .setValue(current.slice(0, 3500))
      )
    );
}

async function openPanelEditor(
  interaction: ChatInputCommandInteraction,
  key: PanelKey
): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'You must be staff to manage this panel.');
    return;
  }
  const existing = await prisma.panel.findUnique({ where: { key } });
  const current = existing?.content ?? PANEL_META[key].default;
  await interaction.showModal(panelModal(key, current));
}

export async function handleInvite(interaction: ChatInputCommandInteraction): Promise<void> {
  await openPanelEditor(interaction, 'invite');
}

export async function handleHowto(interaction: ChatInputCommandInteraction): Promise<void> {
  await openPanelEditor(interaction, 'howto');
}

function buildPanelMessage(key: PanelKey, content: string): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const meta = PANEL_META[key];
  const embed = buildInfoPanelEmbed(meta.title, meta.icon, content, meta.color);
  const components = meta.withBookButton ? [buildOrderPanelRow()] : [];
  return { embed, components };
}

/** Edit the existing panel message if present; otherwise post a fresh one. */
export async function publishPanel(
  client: Client,
  key: string,
  channelId: string,
  embed: EmbedBuilder,
  components: ActionRowBuilder<ButtonBuilder>[]
): Promise<void> {
  const existing = await prisma.panel.findUnique({ where: { key } });

  if (existing?.messageId && existing.channelId) {
    try {
      const ch = await client.channels.fetch(existing.channelId);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(existing.messageId);
        await msg.edit({ embeds: [embed], components });
        if (existing.channelId !== channelId) {
          await prisma.panel.update({ where: { key }, data: { channelId: existing.channelId } });
        }
        return;
      }
    } catch {
      /* message was deleted — fall through and post a new one */
    }
  }

  const ch = await client.channels.fetch(channelId);
  if (!ch?.isTextBased() || ch.isDMBased()) {
    throw new Error('Target channel is not a text channel.');
  }
  const msg = await ch.send({ embeds: [embed], components });
  await prisma.panel.update({ where: { key }, data: { channelId, messageId: msg.id } });
}

export async function handlePanelModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.customId.startsWith(`${PANEL_MODAL_PREFIX}:`)) return;
  const key = interaction.customId.split(':')[1] as PanelKey;
  if (!PANEL_META[key]) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const content = interaction.fields.getTextInputValue('content').trim();
  const channelId = interaction.channelId;
  if (!channelId) {
    await ephemeralReply(interaction, 'Could not determine the target channel.');
    return;
  }

  await prisma.panel.upsert({
    where: { key },
    create: { key, content, channelId },
    update: { content, channelId },
  });

  const { embed, components } = buildPanelMessage(key, content);
  try {
    await publishPanel(interaction.client, key, channelId, embed, components);
    await ephemeralReply(interaction, `**${PANEL_META[key].title}** panel updated in this channel.`);
  } catch (err) {
    console.error('[Bot] Failed to publish panel:', err);
    await ephemeralReply(interaction, 'Saved, but failed to post the panel here. Check my permissions.');
  }
}

export async function handleOrderPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'You must be staff to manage this panel.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = config.channels.orderHere;
  if (!channelId || channelId === '0') {
    await ephemeralReply(interaction, 'Order channel is not configured (ORDER_CHANNEL_ID).');
    return;
  }

  try {
    await publishPanel(
      interaction.client,
      'order',
      channelId,
      buildOrderPanelEmbed(),
      [buildOrderPanelRow()]
    );
    await ephemeralReply(interaction, `Book Now panel posted in <#${channelId}>.`);
  } catch (err) {
    console.error('[Bot] Failed to publish order panel:', err);
    await ephemeralReply(interaction, 'Failed to post the order panel. Check my permissions in that channel.');
  }
}
