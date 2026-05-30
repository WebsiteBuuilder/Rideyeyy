import { Client } from 'discord.js';
import Decimal from 'decimal.js';

export interface AppServices {
  user: any;
  economy: any;
  gambling: any;
  crate: any;
}

export type CrateType = 'bronze' | 'silver' | 'gold';

export interface Card {
  rank: string;
  suit: string;
}

