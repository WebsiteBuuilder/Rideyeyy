import { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { AppServices } from '../types';
export declare const coinflipData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const diceData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const blackjackData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare function handleCoinflip(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleDice(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleBlackjack(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleBlackjackButton(interaction: ButtonInteraction, services: AppServices): Promise<void>;
//# sourceMappingURL=gambling.d.ts.map