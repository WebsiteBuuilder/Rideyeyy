// One-time, read-only schema dump. Runs inside Railway (where the internal
// DATABASE_URL host resolves) and prints every public table + column and an
// approximate row count to the deploy logs. Safe: it only reads metadata.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const bigIntSafe = (_key, value) => (typeof value === 'bigint' ? Number(value) : value);

try {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const counts = await prisma.$queryRawUnsafe(`
    SELECT relname AS table_name, n_live_tup AS approx_rows
    FROM pg_stat_user_tables
    ORDER BY relname
  `);

  console.log('=== DB SCHEMA DUMP START ===');
  console.log('--- TABLE ROW COUNTS ---');
  console.log(JSON.stringify(counts, bigIntSafe, 2));
  console.log('--- COLUMNS ---');
  console.log(JSON.stringify(columns, bigIntSafe, 2));
  console.log('=== DB SCHEMA DUMP END ===');
} catch (err) {
  console.error('=== DB SCHEMA DUMP ERROR ===');
  console.error(err);
} finally {
  await prisma.$disconnect();
}
