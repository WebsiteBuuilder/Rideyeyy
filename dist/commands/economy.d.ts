import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
export declare const data: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const payData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const tipData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const dailyData: SlashCommandBuilder;
export declare const statsData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const rankData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const leaderboardData: import("discord.js").SlashCommandOptionsOnlyBuilder;
export declare const inventoryData: SlashCommandBuilder;
export declare function handleBalance(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handlePay(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleTip(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleDaily(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleStats(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleRank(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleLeaderboard(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
export declare function handleInventory(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void>;
//# sourceMappingURL=economy.d.ts.map