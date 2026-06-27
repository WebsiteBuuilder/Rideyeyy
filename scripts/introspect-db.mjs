// One-time, read-only data dump for crate reward wiring. Runs inside Railway.
// Emits ONE single-line console.log per row so the log pipeline cannot split or
// reorder multi-line messages. Read-only.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

try {
  console.log('========== CRATE_REWARDS DATA DUMP START ==========');

  const distinct = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT reward_type FROM crate_rewards ORDER BY reward_type`
  );
  console.log('REWARD_TYPES :: ' + distinct.map((r) => r.reward_type).join(' | '));

  const rows = await prisma.$queryRawUnsafe(`
    SELECT crate_type, reward_type, reward_value::text AS reward_value,
           weight, reward_metadata
    FROM crate_rewards
    ORDER BY crate_type, weight DESC
  `);

  for (const r of rows) {
    const meta = r.reward_metadata ? JSON.stringify(r.reward_metadata) : 'null';
    console.log(
      `ROW :: crate=${r.crate_type} type=${r.reward_type} value=${r.reward_value} weight=${r.weight} meta=${meta}`
    );
  }

  console.log('========== CRATE_REWARDS DATA DUMP END ==========');
} catch (err) {
  console.error('=== CRATE DATA DUMP ERROR ===\n' + (err?.stack || err));
} finally {
  await prisma.$disconnect();
}
