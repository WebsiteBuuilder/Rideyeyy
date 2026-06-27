// One-time, read-only schema dump. Runs inside Railway (where the internal
// DATABASE_URL host resolves). Prints ONE atomic block (single console.log)
// so the output cannot interleave in the deploy logs. Read-only.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

// Tables I already own via Prisma — exclude them to keep the dump focused on
// the original bot's economy/crate/gambling schema.
const EXCLUDE = new Set(['User', 'Booking', 'BookingSequence', 'ProviderStats', 'Vouch', 'Blacklist']);

try {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const pks = await prisma.$queryRawUnsafe(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const counts = await prisma.$queryRawUnsafe(`
    SELECT relname AS table_name, n_live_tup AS approx_rows
    FROM pg_stat_user_tables ORDER BY relname
  `);

  const pkByTable = {};
  for (const r of pks) (pkByTable[r.table_name] ??= []).push(r.column_name);

  const countByTable = {};
  for (const r of counts) countByTable[r.table_name] = Number(r.approx_rows);

  const byTable = {};
  for (const c of columns) {
    if (EXCLUDE.has(c.table_name)) continue;
    (byTable[c.table_name] ??= []).push(c);
  }

  let out = '\n========== ECONOMY SCHEMA DUMP START ==========\n';
  for (const [table, cols] of Object.entries(byTable)) {
    const pk = pkByTable[table]?.length ? ` (PK: ${pkByTable[table].join(', ')})` : '';
    out += `\n### ${table}  [~${countByTable[table] ?? 0} rows]${pk}\n`;
    for (const c of cols) {
      const nn = c.is_nullable === 'NO' ? ' NOT NULL' : '';
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
      out += `   - ${c.column_name}: ${c.data_type}${nn}${def}\n`;
    }
  }
  out += '\n========== ECONOMY SCHEMA DUMP END ==========\n';
  console.log(out);
} catch (err) {
  console.error('=== DB SCHEMA DUMP ERROR ===\n' + (err?.stack || err));
} finally {
  await prisma.$disconnect();
}
