/* eslint-disable @typescript-eslint/no-require-imports */
// Prisma 7 generates its client at runtime (after `prisma generate`).
// We use a dynamic require so TypeScript doesn't need the generated types.
import pg from 'pg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrismaClient = any;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: AnyPrismaClient | undefined;
}

function createClient(): AnyPrismaClient {
  // These are available after `prisma generate` runs during Railway build
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { PrismaClient } = require('@prisma/client');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { PrismaPg } = require('@prisma/adapter-pg');
  const pool    = new pg.Pool({ connectionString: process.env['DATABASE_URL']! });
  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
  return new PrismaClient({ adapter });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const prisma: AnyPrismaClient = global.__prisma ?? createClient();

if (process.env['NODE_ENV'] !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  global.__prisma = prisma;
}
