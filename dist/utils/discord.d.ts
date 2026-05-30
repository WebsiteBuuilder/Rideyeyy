import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, Guild, GuildMember, MessageComponentInteraction, SlashCommandBuilder } from 'discord.js';
export declare const BRAND: {
    readonly name: "GUHD RIDES";
    readonly currency: "Route Cash";
    readonly ticker: "RC";
    readonly tagline: "Premium Casino";
    readonly logo: "◈";
    readonly icon: "🎰";
};
export declare const COLOR: {
    readonly BRAND: 1710638;
    readonly ACCENT: 1450302;
    readonly WIN: 53866;
    readonly LOSS: 16729943;
    readonly JACKPOT: 16766720;
    readonly EPIC: 14702333;
    readonly RARE: 10181046;
    readonly ACTIVE: 4886745;
    readonly ELECTRIC: 54527;
    readonly INFO: 5793266;
    readonly NEUTRAL: 3092790;
    readonly WHITE: 16777215;
    readonly MUTED: 7634829;
};
/** Elegant line separator */
export declare const LINE = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
/** Thin separator for sub-sections */
export declare const THIN_LINE = "\u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500 \u2500";
/** Zero-width spacer */
export declare const SPACER = "\u200B";
/** Card suit icons for premium display */
export declare const SUITS: {
    readonly H: {
        readonly icon: "♥";
        readonly color: "red";
        readonly name: "Hearts";
    };
    readonly D: {
        readonly icon: "♦";
        readonly color: "red";
        readonly name: "Diamonds";
    };
    readonly C: {
        readonly icon: "♣";
        readonly color: "black";
        readonly name: "Clubs";
    };
    readonly S: {
        readonly icon: "♠";
        readonly color: "black";
        readonly name: "Spades";
    };
};
export declare const ICON: {
    readonly coin: "◈";
    readonly coins: "💰";
    readonly wallet: "👛";
    readonly bank: "🏦";
    readonly cards: "🃏";
    readonly dice: "🎲";
    readonly slot: "🎰";
    readonly chip: "🪙";
    readonly win: "✦";
    readonly loss: "✕";
    readonly push: "≈";
    readonly jackpot: "★";
    readonly streak: "🔥";
    readonly hit: "↓";
    readonly stand: "■";
    readonly double: "⬆";
    readonly split: "⟷";
    readonly fold: "↩";
    readonly common: "○";
    readonly uncommon: "◐";
    readonly rare: "●";
    readonly epic: "◆";
    readonly legendary: "★";
    readonly time: "⏱";
    readonly check: "✓";
    readonly cross: "✕";
    readonly arrow: "→";
    readonly up: "↗";
    readonly down: "↘";
};
/** Premium progress bar with gradient feel */
export declare function progressBar(value: number, max: number, size?: number): string;
/** Animated-feel meter with percentage */
export declare function meter(value: number, max: number): string;
/** XP-style bar for streaks */
export declare function streakBar(current: number, max: number): string;
/** Standard currency display */
export declare function rcDisplay(amount: string): string;
/** Large hero amount for big displays */
export declare function heroAmount(amount: string): string;
/** Compact inline amount */
export declare function inlineRC(amount: string | number): string;
/** Net change with directional indicator */
export declare function netLabel(net: string, positive: boolean): string;
/** Large net change for results */
export declare function heroNet(amount: string, positive: boolean): string;
/** Clean stat block for embed fields */
export declare function statBlock(label: string, value: string): string;
/** Inline stat for compact displays */
export declare function inlineStat(label: string, value: string): string;
/** Key-value pair row */
export declare function kvRow(key: string, value: string): string;
/** Premium status banner with ANSI colors */
export declare function statusBanner(text: string, style?: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral'): string;
/** Game result banner */
export declare function resultBanner(result: 'win' | 'loss' | 'push' | 'jackpot' | 'bust' | 'surrender'): string;
/** Premium single card display */
export declare function cardDisplay(rank: string, suit: string): string;
/** Hidden card display */
export declare function hiddenCard(): string;
/** Hand display with cards */
export declare function handDisplay(cards: Array<{
    rank: string;
    suit: string;
}>, hideIndex?: number): string;
/** Hand value display with special states */
export declare function handValue(value: number, revealed: boolean): string;
/** Casino table header */
export declare function tableHeader(title: string): string;
/** Dealer section */
export declare function dealerSection(cards: string, value: string): string;
/** Player section */
export declare function playerSection(cards: string, value: string): string;
/**
 * Base casino embed with consistent branding
 */
export declare function baseEmbed(color: number, balance?: string, guild?: Guild | null): EmbedBuilder;
/**
 * Premium branded embed with author line
 */
export declare function brandedEmbed(color: number, balance?: string, guild?: Guild | null): EmbedBuilder;
/**
 * Casino game embed with table styling
 */
export declare function gameEmbed(title: string, color: number, guild?: Guild | null): EmbedBuilder;
/**
 * Result embed with prominent status
 */
export declare function resultEmbed(result: 'win' | 'loss' | 'push' | 'jackpot' | 'bust' | 'surrender', payout: string, balance: string, guild?: Guild | null): EmbedBuilder;
/** Reply ephemerally with an embed */
export declare function ephemeralEmbed(interaction: ChatInputCommandInteraction | MessageComponentInteraction, embed: EmbedBuilder): Promise<void>;
/** Reply publicly with an embed */
export declare function publicEmbed(interaction: ChatInputCommandInteraction | MessageComponentInteraction, embed: EmbedBuilder): Promise<void>;
/** Quick ephemeral text reply */
export declare function ephemeralReply(interaction: ChatInputCommandInteraction | MessageComponentInteraction, content: string): Promise<void>;
export type SlashCommandData = SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
/** Premium action button */
export declare function actionButton(customId: string, label: string, style: ButtonStyle, disabled?: boolean): ButtonBuilder;
/** Confirmation button row */
export declare function buildConfirmRow(customIdPrefix: string): ActionRowBuilder<ButtonBuilder>;
export declare function waitForConfirmation(interaction: ChatInputCommandInteraction, customIdPrefix: string, warningMessage: string): Promise<boolean>;
export declare function waitForFollowUpConfirmation(interaction: ChatInputCommandInteraction, customIdPrefix: string, warningMessage: string): Promise<boolean>;
export declare function hasAdminRole(member: GuildMember): boolean;
export declare function hasStaffRole(member: GuildMember): boolean;
export declare function checkCooldown(userId: string, key: string, cooldownMs: number): number | null;
export declare function isButtonInteraction(interaction: unknown): interaction is ButtonInteraction;
export declare function memberFromInteraction(interaction: ChatInputCommandInteraction): GuildMember | null;
//# sourceMappingURL=discord.d.ts.map