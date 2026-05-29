import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, PoolConfig } from 'pg';
import parse from 'pg-connection-string';

export type ConnectionMode = 'railway-pg-vars' | 'database-url';

function normalizeDatabaseUrl(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

function sslForHost(host: string | undefined): false | { rejectUnauthorized: boolean } {
  if (!host) return false;
  if (host.endsWith('.railway.internal')) return false;
  if (host.includes('rlwy.net') || host.includes('railway.app')) {
    return { rejectUnauthorized: false };
  }
  return false;
}

/**
 * Railway injects raw PG* vars when you reference them from the Postgres service.
 * This avoids URL-encoding bugs that cause 28P01 with DATABASE_URL alone.
 */
function configFromPgVars(): PoolConfig | null {
  const host = process.env.PGHOST?.trim();
  const password = process.env.PGPASSWORD?.trim();
  if (!host || !password) return null;

  return {
    host,
    port: parseInt(process.env.PGPORT?.trim() || '5432', 10),
    user: process.env.PGUSER?.trim() || 'postgres',
    password,
    database: process.env.PGDATABASE?.trim() || 'railway',
    ssl: sslForHost(host),
  };
}

function configFromDatabaseUrl(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'No database credentials found. On Railway: Postgres service → Connect → select your bot service (injects PGHOST/PGPASSWORD), OR add References for PGHOST, PGPASSWORD, PGUSER, PGDATABASE, PGPORT on the bot.'
    );
  }

  const connectionString = normalizeDatabaseUrl(raw);

  if (connectionString.includes('${{') || connectionString.includes('{{')) {
    throw new Error('DATABASE_URL is an unresolved Railway template. Use Variable References or Postgres → Connect.');
  }

  if (
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('user:password')
  ) {
    throw new Error('DATABASE_URL is a placeholder. Use Railway Postgres Connect or PG* variable references.');
  }

  const parsed = parse.parse(connectionString);
  const host = parsed.host ?? undefined;

  if (host && parsed.user && parsed.password && parsed.database) {
    return {
      host,
      port: parsed.port ? parseInt(String(parsed.port), 10) : 5432,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: sslForHost(host),
    };
  }

  let urlWithSsl = connectionString;
  if (host?.endsWith('.railway.internal') && !urlWithSsl.includes('sslmode=')) {
    urlWithSsl += (urlWithSsl.includes('?') ? '&' : '?') + 'sslmode=disable';
  }

  return {
    connectionString: urlWithSsl,
    ssl: sslForHost(host),
  };
}

let connectionMode: ConnectionMode = 'database-url';

function resolvePoolConfig(): PoolConfig {
  const fromPg = configFromPgVars();
  if (fromPg) {
    connectionMode = 'railway-pg-vars';
    return fromPg;
  }
  connectionMode = 'database-url';
  return configFromDatabaseUrl();
}

/** Safe connection details for logs — never logs password. */
export function getDatabaseDiagnostics(): {
  mode: ConnectionMode;
  host: string;
  port: string;
  user: string;
  database: string;
  network: 'private' | 'public' | 'unknown';
  passwordLength: number;
  sslEnabled: boolean;
} {
  try {
    const config = resolvePoolConfig();
    const host = config.host ?? (config.connectionString?.includes('.railway.internal') ? 'postgres.railway.internal' : 'connection-string');
    const network: 'private' | 'public' | 'unknown' = host.endsWith('.railway.internal')
      ? 'private'
      : host.includes('rlwy.net') || host.includes('railway.app')
        ? 'public'
        : 'unknown';

    const ssl = config.ssl;
    const sslEnabled = ssl !== false && ssl !== undefined;

    return {
      mode: connectionMode,
      host,
      port: String(config.port ?? 5432),
      user: config.user ?? 'postgres',
      database: config.database ?? 'railway',
      network,
      passwordLength: (config.password ?? '').length,
      sslEnabled,
    };
  } catch {
    return {
      mode: connectionMode,
      host: 'error',
      port: '?',
      user: '?',
      database: '?',
      network: 'unknown',
      passwordLength: 0,
      sslEnabled: false,
    };
  }
}

export function logDatabaseDiagnostics(): void {
  const d = getDatabaseDiagnostics();
  console.log(
    `[db] mode=${d.mode} host=${d.host} port=${d.port} user=${d.user} database=${d.database} network=${d.network} ssl=${d.sslEnabled} passwordLength=${d.passwordLength}`
  );

  if (d.mode === 'database-url' && process.env.RAILWAY_ENVIRONMENT) {
    console.warn(
      '[db] Using DATABASE_URL only. For reliable Railway auth, use Postgres → Connect → your bot service (adds PGHOST/PGPASSWORD), or reference PGHOST + PGPASSWORD on the bot.'
    );
  }

  if (d.passwordLength === 0) {
    console.warn('[db] No password resolved — connection will fail.');
  }
}

const poolConfig = resolvePoolConfig();
export const pool = new Pool(poolConfig);

export async function verifyDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function getMigrationsDir(): string {
  const nextToCompiled = path.join(__dirname, 'migrations');
  if (fs.existsSync(nextToCompiled)) {
    return nextToCompiled;
  }
  throw new Error(`Migrations directory not found at ${nextToCompiled}`);
}

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  const dir = getMigrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file;
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (applied.rowCount && applied.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
