// One-time, read-only schema dump. Runs inside Railway (internal host works).
// Prints ONE console.log PER TABLE so no single line is large enough to be
// truncated by the log pipeline. Read-only.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

// Focused set: the tables needed to wire economy/crate/gambling services.
const WANT = [
  'blackjack_games',
  'crate_opens',
  'crate_rewards',
  'daily_claims',
  'economy_snapshots',
  'frozen_users',
];

try {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const byTable = {};
  for (const c of columns) (byTable[c.table_name] ??= []).push(c);

  console.log('========== FOCUSED SCHEMA DUMP START ==========');
  for (const table of WANT) {
    const cols = byTable[table];
    if (!cols) { console.log(`### ${table}: (table not found)`); continue; }
    let block = `### ${table}\n`;
    for (const c of cols) {
      const nn = c.is_nullable === 'NO' ? ' NOT NULL' : '';
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
      block += `   - ${c.column_name}: ${c.data_type}${nn}${def}\n`;
    }
    console.log(block);
  }
  console.log('========== FOCUSED SCHEMA DUMP END ==========');
} catch (err) {
  console.error('=== DB SCHEMA DUMP ERROR ===\n' + (err?.stack || err));
} finally {
  await prisma.$disconnect();
}
