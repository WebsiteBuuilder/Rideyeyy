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

function appendSslModeForInternal(url: string): string {
  if (!url.includes('.railway.internal') || url.includes('sslmode=')) {
    return url;
  }
  return url + (url.includes('?') ? '&' : '?') + 'sslmode=disable';
}

function validateDatabaseUrl(url: string): void {
  if (url.includes('${{') || url.includes('{{')) {
    throw new Error('DATABASE_URL is unresolved. Use Railway Variable Reference, not a literal template.');
  }
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('user:password')) {
    throw new Error('DATABASE_URL is a placeholder. Use Railway Postgres → Connect or Variable Reference.');
  }
}

/**
 * Best for Railway: raw PGPASSWORD (from Connect or Reference) cannot go stale like URL strings.
 */
function configFromPgVars(): PoolConfig | null {
  const password = process.env.PGPASSWORD?.trim();
  if (!password) return null;

  let host = process.env.PGHOST?.trim();
  let port = parseInt(process.env.PGPORT?.trim() || '5432', 10);
  let user = process.env.PGUSER?.trim() || 'postgres';
  let database = process.env.PGDATABASE?.trim() || 'railway';

  if (!host && process.env.DATABASE_URL) {
    const parsed = parse.parse(normalizeDatabaseUrl(process.env.DATABASE_URL));
    host = parsed.host ?? undefined;
    if (parsed.port) port = parseInt(String(parsed.port), 10);
    if (parsed.user) user = parsed.user;
    if (parsed.database) database = parsed.database;

    if (parsed.password && parsed.password !== password) {
      console.warn(
        '[db] DATABASE_URL password does not match PGPASSWORD — using PGPASSWORD (DATABASE_URL may be stale; delete it or update the reference).'
      );
    }
  }

  if (!host) return null;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: sslForHost(host),
  };
}

/** Pass DATABASE_URL directly to pg — no field splitting that can corrupt credentials. */
function configFromDatabaseUrl(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'Missing database config. Railway: PostgreSQL → Connect → select bot service. Or set DATABASE_URL as a Reference (not a pasted string).'
    );
  }

  const connectionString = appendSslModeForInternal(normalizeDatabaseUrl(raw));
  validateDatabaseUrl(connectionString);

  return { connectionString };
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

function parsedFromEnv(): ReturnType<typeof parse.parse> | null {
  if (!process.env.DATABASE_URL) return null;
  try {
    return parse.parse(normalizeDatabaseUrl(process.env.DATABASE_URL));
  } catch {
    return null;
  }
}

export function getDatabaseDiagnostics(): {
  mode: ConnectionMode;
  host: string;
  port: string;
  user: string;
  database: string;
  network: 'private' | 'public' | 'unknown';
  passwordLength: number;
  sslEnabled: boolean;
  hasPgPassword: boolean;
} {
  try {
    const config = resolvePoolConfig();
    const parsed = parsedFromEnv();
    const host =
      config.host ??
      parsed?.host ??
      (config.connectionString?.includes('.railway.internal') ? 'postgres.railway.internal' : 'unknown');

    const network: 'private' | 'public' | 'unknown' = host.endsWith('.railway.internal')
      ? 'private'
      : host.includes('rlwy.net') || host.includes('railway.app')
        ? 'public'
        : 'unknown';

    const passwordLength =
      (config.password ?? parsed?.password ?? '').length ||
      (process.env.PGPASSWORD?.trim().length ?? 0);

    return {
      mode: connectionMode,
      host,
      port: String(config.port ?? parsed?.port ?? 5432),
      user: config.user ?? parsed?.user ?? 'postgres',
      database: config.database ?? parsed?.database ?? 'railway',
      network,
      passwordLength,
      sslEnabled: false,
      hasPgPassword: Boolean(process.env.PGPASSWORD?.trim()),
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
      hasPgPassword: false,
    };
  }
}

export function logDatabaseDiagnostics(): void {
  const d = getDatabaseDiagnostics();
  console.log(
    `[db] mode=${d.mode} host=${d.host} port=${d.port} user=${d.user} database=${d.database} network=${d.network} passwordLength=${d.passwordLength} hasPgPassword=${d.hasPgPassword}`
  );

  if (d.mode === 'database-url' && !d.hasPgPassword) {
    console.warn(
      '[db] Only DATABASE_URL is set. If auth fails, the URL password is stale. Fix: Postgres → Connect → bot, OR add PGPASSWORD Reference on bot, OR reset Postgres credentials and update DATABASE_URL Reference (never paste manually).'
    );
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
