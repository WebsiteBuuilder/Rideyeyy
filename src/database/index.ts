import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, PoolConfig } from 'pg';

function normalizeDatabaseUrl(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

function resolvePoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'Missing DATABASE_URL. On Railway bot service: Variables → New Variable → Reference → PostgreSQL → DATABASE_PRIVATE_URL, and name the variable DATABASE_URL on the bot.'
    );
  }

  const connectionString = normalizeDatabaseUrl(raw);

  if (connectionString.includes('${{') || connectionString.includes('{{')) {
    throw new Error(
      'DATABASE_URL looks like an unresolved Railway template. Use Variables → Reference on the bot service, not a literal ${{...}} string.'
    );
  }

  if (
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('user:password')
  ) {
    throw new Error(
      'DATABASE_URL points to localhost or a placeholder. Delete it and add a Reference from your Railway PostgreSQL service.'
    );
  }

  const isRailway =
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    connectionString.includes('railway') ||
    connectionString.includes('rlwy.net');

  const sslDisabled = connectionString.includes('sslmode=disable');
  const ssl =
    !sslDisabled && (isRailway || connectionString.includes('sslmode=require'))
      ? { rejectUnauthorized: false }
      : undefined;

  return { connectionString, ssl };
}

/** Safe connection details for logs — never logs password. */
export function getDatabaseDiagnostics(): {
  host: string;
  port: string;
  user: string;
  database: string;
  network: 'private' | 'public' | 'unknown';
  passwordLength: number;
  sslEnabled: boolean;
  urlLooksValid: boolean;
} {
  const poolConfig = resolvePoolConfig();
  const connectionString = poolConfig.connectionString ?? '';
  const ssl = poolConfig.ssl;
  const network: 'private' | 'public' | 'unknown' = connectionString.includes('.railway.internal')
    ? 'private'
    : connectionString.includes('rlwy.net') || connectionString.includes('railway.app')
      ? 'public'
      : 'unknown';

  try {
    const normalized = connectionString.replace(/^postgres(ql)?:\/\//, 'http://');
    const url = new URL(normalized);
    return {
      host: url.hostname,
      port: url.port || '5432',
      user: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.slice(1).split('?')[0] || ''),
      network,
      passwordLength: decodeURIComponent(url.password || '').length,
      sslEnabled: Boolean(ssl),
      urlLooksValid: true,
    };
  } catch {
    return {
      host: 'unparseable',
      port: '?',
      user: '?',
      database: '?',
      network,
      passwordLength: 0,
      sslEnabled: Boolean(ssl),
      urlLooksValid: false,
    };
  }
}

export function logDatabaseDiagnostics(): void {
  const d = getDatabaseDiagnostics();
  console.log(
    `[db] target host=${d.host} port=${d.port} user=${d.user} database=${d.database} network=${d.network} ssl=${d.sslEnabled} passwordLength=${d.passwordLength} urlValid=${d.urlLooksValid}`
  );

  if (d.network === 'public' && process.env.RAILWAY_ENVIRONMENT) {
    console.warn(
      '[db] Using a PUBLIC Postgres URL inside Railway. If auth fails, set bot DATABASE_URL to a Reference of PostgreSQL → DATABASE_PRIVATE_URL (variable name on bot stays DATABASE_URL).'
    );
  }

  if (!d.urlLooksValid) {
    console.warn(
      '[db] DATABASE_URL could not be parsed. If the password has special characters, use Railway Reference instead of copy-paste.'
    );
  }

  if (d.passwordLength === 0) {
    console.warn('[db] DATABASE_URL has no password segment — connection will fail.');
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
