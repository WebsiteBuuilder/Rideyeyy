import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
export declare function buildCrateButtons(): ActionRowBuilder<ButtonBuilder>;
export declare const data: SlashCommandBuilder;
export declare function execute(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleCrateButton(interaction: ButtonInteraction, services: AppServices): Promise<void>;
//# sourceMappingURL=crates.d.ts.map