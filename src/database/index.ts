import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, PoolConfig } from 'pg';

function normalizeDatabaseUrl(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

interface ParsedDatabaseUrl {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: false | { rejectUnauthorized: boolean };
}

function parseDatabaseUrl(connectionString: string): ParsedDatabaseUrl {
  const normalized = connectionString.replace(/^postgres(ql)?:\/\//, 'http://');
  const url = new URL(normalized);

  const host = url.hostname;
  const isPrivateRailway = host.endsWith('.railway.internal');

  // Railway private network Postgres does NOT use SSL — forcing it causes 28P01 auth failures.
  let ssl: ParsedDatabaseUrl['ssl'];
  if (isPrivateRailway || connectionString.includes('sslmode=disable')) {
    ssl = false;
  } else if (
    connectionString.includes('sslmode=require') ||
    connectionString.includes('rlwy.net') ||
    connectionString.includes('railway.app')
  ) {
    ssl = { rejectUnauthorized: false };
  } else {
    ssl = false;
  }

  return {
    host,
    port: url.port ? parseInt(url.port, 10) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0]),
    ssl,
  };
}

function resolvePoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'Missing DATABASE_URL. On Railway bot service: Variables → Reference → PostgreSQL → DATABASE_PRIVATE_URL, named DATABASE_URL on the bot.'
    );
  }

  const connectionString = normalizeDatabaseUrl(raw);

  if (connectionString.includes('${{') || connectionString.includes('{{')) {
    throw new Error(
      'DATABASE_URL looks like an unresolved Railway template. Use Variables → Reference on the bot service.'
    );
  }

  if (
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('user:password')
  ) {
    throw new Error(
      'DATABASE_URL points to localhost or a placeholder. Use a Railway PostgreSQL reference instead.'
    );
  }

  const parsed = parseDatabaseUrl(connectionString);

  return {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: parsed.ssl,
  };
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
  try {
    const config = resolvePoolConfig();
    const host = config.host ?? 'unknown';
    const network: 'private' | 'public' | 'unknown' = host.endsWith('.railway.internal')
      ? 'private'
      : host.includes('rlwy.net') || host.includes('railway.app')
        ? 'public'
        : 'unknown';

    return {
      host,
      port: String(config.port ?? 5432),
      user: config.user ?? '?',
      database: config.database ?? '?',
      network,
      passwordLength: (config.password ?? '').length,
      sslEnabled: config.ssl !== false && config.ssl !== undefined,
      urlLooksValid: true,
    };
  } catch {
    return {
      host: 'unparseable',
      port: '?',
      user: '?',
      database: '?',
      network: 'unknown',
      passwordLength: 0,
      sslEnabled: false,
      urlLooksValid: false,
    };
  }
}

export function logDatabaseDiagnostics(): void {
  const d = getDatabaseDiagnostics();
  console.log(
    `[db] target host=${d.host} port=${d.port} user=${d.user} database=${d.database} network=${d.network} ssl=${d.sslEnabled} passwordLength=${d.passwordLength} urlValid=${d.urlLooksValid}`
  );

  if (d.network === 'private' && d.sslEnabled) {
    console.warn('[db] SSL enabled for private Railway host — this should not happen after the latest fix.');
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
