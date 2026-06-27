// One-time, read-only column dump for the tables the services INSERT into.
// Emits ONE single-line console.log per column so the log pipeline cannot split
// or reorder multi-line messages. Read-only.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

try {
  console.log('========== WRITE-TARGET COLUMNS DUMP START ==========');
  const cols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('transactions', 'crate_opens', 'user_inventory', 'daily_claims')
    ORDER BY table_name, ordinal_position
  `);
  for (const c of cols) {
    const nn = c.is_nullable === 'NO' ? 'NOT NULL' : 'NULL';
    const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
    console.log(`COL :: ${c.table_name}.${c.column_name} [${c.ordinal_position}] ${c.data_type} ${nn}${def}`);
  }
  console.log('========== WRITE-TARGET COLUMNS DUMP END ==========');
} catch (err) {
  console.error('=== COLUMNS DUMP ERROR ===\n' + (err?.stack || err));
} finally {
  await prisma.$disconnect();
}
