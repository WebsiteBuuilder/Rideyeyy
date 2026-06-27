import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
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
import type { AppServices } from '../types';
import { COLOR, BRAND, ICON, ephemeralReply, hasStaffRole, memberFromInteraction } from '../utils/discord';
import { publishPanel } from './panels';

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

export const verifyPanelData = new SlashCommandBuilder()
  .setName('verifypanel')
  .setDescription('Post or refresh the member verification panel (staff only)');

function buildVerifyEmbed(content: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.ELECTRIC)
    .setAuthor({ name: `${BRAND.logo}  Member Verification` })
    .setTitle(`${ICON.check} Verify Your Account`)
    .setDescription(content)
    .setTimestamp();
}

function buildVerifyRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BTN_START).setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('✅')
  );
}

export async function handleVerifyPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || !hasStaffRole(member)) {
    await ephemeralReply(interaction, 'You must be staff to manage this panel.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = config.channels.verify;
  if (!channelId || channelId === '0') {
    await ephemeralReply(interaction, 'Verify channel is not configured (VERIFY_CHANNEL_ID).');
    return;
  }

  try {
    await ensureVerifyPanel(interaction.client, channelId);
    await ephemeralReply(interaction, `Verification panel posted in <#${channelId}>.`);
  } catch (err) {
    console.error('[Bot] Failed to publish verify panel:', err);
    await ephemeralReply(interaction, 'Failed to post the verify panel. Check my permissions in that channel.');
  }
}

/** Auto-post verify panel on boot if missing or message deleted. */
export async function ensureVerifyPanel(client: Client, channelId?: string): Promise<void> {
  const target = channelId ?? config.channels.verify;
  if (!target || target === '0') return;

  const existing = await prisma.panel.findUnique({ where: { key: PANEL_KEY } });
  const content = existing?.content ?? DEFAULT_CONTENT;

  await prisma.panel.upsert({
    where: { key: PANEL_KEY },
    create: { key: PANEL_KEY, content, channelId: target },
    update: { channelId: target },
  });

  await publishPanel(client, PANEL_KEY, target, buildVerifyEmbed(content), [buildVerifyRow()]);
}

export async function handleVerifyButton(interaction: ButtonInteraction, services: AppServices): Promise<void> {
  if (!interaction.inGuild() || !interaction.member) return;

  const question = services.memberVerify.buildCaptchaPrompt(interaction.user.id);
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Verification Captcha')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('answer')
          .setLabel(question.slice(0, 45))
          .setPlaceholder('Enter the number')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
      )
    );
  await interaction.showModal(modal);
}

export async function handleVerifyModal(interaction: ModalSubmitInteraction, services: AppServices): Promise<void> {
  if (!interaction.inGuild() || !interaction.member || interaction.member.user.bot) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const answer = interaction.fields.getTextInputValue('answer');
  const member = interaction.member;
  if (!('guild' in member)) {
    await ephemeralReply(interaction, 'Could not resolve your membership.');
    return;
  }

  try {
    const result = await services.memberVerify.completeCaptcha(interaction.client, member, answer);
    if (!result.ok) {
      await ephemeralReply(interaction, result.message);
      return;
    }
    if (result.alreadyVerified) {
      await ephemeralReply(interaction, 'You are already verified.');
      return;
    }
    await ephemeralReply(interaction, `${ICON.check} Verified! You now have full server access.`);
  } catch (err) {
    console.error('[Verify] completeCaptcha error:', err);
    await ephemeralReply(interaction, 'Verification failed due to an internal error. Contact staff.');
  }
}
