import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, PoolConfig } from 'pg';
import parse from 'pg-connection-string';

export type ConnectionMode =
  | 'railway-pg-vars'
  | 'database-private-url'
  | 'database-url'
  | 'database-public-url';

function cleanEnv(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  let s = value.trim().replace(/\r$/, '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s || undefined;
}

function isUnresolvedTemplate(value: string): boolean {
  return value.includes('${{') || value.includes('{{');
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

function appendSslModeRequire(url: string): string {
  if (url.includes('sslmode=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'sslmode=require';
}

interface CandidateConfig {
  mode: ConnectionMode;
  config: PoolConfig;
}

/** All PG* must come from the same Postgres service — never mix with DATABASE_URL fields. */
function candidateFromPgVars(): CandidateConfig | null {
  const host = cleanEnv(process.env.PGHOST);
  const password = cleanEnv(process.env.PGPASSWORD);
  const user = cleanEnv(process.env.PGUSER);
  const database = cleanEnv(process.env.PGDATABASE);
  const portRaw = cleanEnv(process.env.PGPORT);

  if (!password) return null;

  if (!host || !user || !database) {
    console.warn(
      `[db] PGPASSWORD is set but missing PGHOST/PGUSER/PGDATABASE (have host=${Boolean(host)} user=${Boolean(user)} database=${Boolean(database)}). Add all 5 PG* references from the same Postgres service, or delete PGPASSWORD and use DATABASE_PRIVATE_URL only.`
    );
    return null;
  }

  if (isUnresolvedTemplate(password) || isUnresolvedTemplate(host)) {
    throw new Error('PG* variables look like unresolved Railway templates. Use Variable Reference UI, do not type ${{...}} manually.');
  }

  return {
    mode: 'railway-pg-vars',
    config: {
      host,
      port: portRaw ? parseInt(portRaw, 10) : 5432,
      user,
      password,
      database,
      ssl: sslForHost(host),
    },
  };
}

function candidateFromUrl(
  mode: ConnectionMode,
  raw: string | undefined,
  transform: (url: string) => string
): CandidateConfig | null {
  const value = cleanEnv(raw);
  if (!value || isUnresolvedTemplate(value)) return null;
  if (value.includes('localhost') || value.includes('user:password')) return null;

  return {
    mode,
    config: { connectionString: transform(value) },
  };
}

function buildCandidates(): CandidateConfig[] {
  const candidates: CandidateConfig[] = [];

  const pgVars = candidateFromPgVars();
  if (pgVars) candidates.push(pgVars);

  // Railway Connect often injects DATABASE_PRIVATE_URL — not DATABASE_URL
  const privateUrl = candidateFromUrl(
    'database-private-url',
    process.env.DATABASE_PRIVATE_URL,
    appendSslModeForInternal
  );
  if (privateUrl) candidates.push(privateUrl);

  const databaseUrl = candidateFromUrl(
    'database-url',
    process.env.DATABASE_URL,
    appendSslModeForInternal
  );
  if (databaseUrl) candidates.push(databaseUrl);

  const publicUrl = candidateFromUrl(
    'database-public-url',
    process.env.DATABASE_PUBLIC_URL,
    appendSslModeRequire
  );
  if (publicUrl) candidates.push(publicUrl);

  return candidates;
}

let connectionMode: ConnectionMode = 'database-url';
let poolInstance: Pool | null = null;

export function logDatabaseEnvChecklist(): void {
  const keys = [
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE',
    'DATABASE_URL',
    'DATABASE_PRIVATE_URL',
    'DATABASE_PUBLIC_URL',
    'RAILWAY_ENVIRONMENT',
  ] as const;

  const status = keys.map((k) => {
    const v = cleanEnv(process.env[k]);
    const set = Boolean(v);
    const bad = v ? isUnresolvedTemplate(v) : false;
    return `${k}=${set ? (bad ? 'UNRESOLVED_TEMPLATE' : 'set') : 'missing'}`;
  });

  console.log(`[db] env checklist: ${status.join(' ')}`);
}

export function getDatabaseDiagnostics(): {
  mode: ConnectionMode;
  host: string;
  port: string;
  user: string;
  database: string;
  passwordLength: number;
} {
  const candidates = buildCandidates();
  const first = candidates[0];
  if (!first) {
    return {
      mode: connectionMode,
      host: 'none',
      port: '?',
      user: '?',
      database: '?',
      passwordLength: 0,
    };
  }

  const c = first.config;
  if (c.connectionString) {
    try {
      const parsed = parse.parse(c.connectionString);
      return {
        mode: first.mode,
        host: parsed.host ?? '?',
        port: String(parsed.port ?? 5432),
        user: parsed.user ?? '?',
        database: parsed.database ?? '?',
        passwordLength: (parsed.password ?? '').length,
      };
    } catch {
      return {
        mode: first.mode,
        host: 'parse-error',
        port: '?',
        user: '?',
        database: '?',
        passwordLength: 0,
      };
    }
  }

  return {
    mode: first.mode,
    host: c.host ?? '?',
    port: String(c.port ?? 5432),
    user: c.user ?? '?',
    database: c.database ?? '?',
    passwordLength: (c.password ?? '').length,
  };
}

export function logDatabaseDiagnostics(): void {
  const d = getDatabaseDiagnostics();
  console.log(
    `[db] will try mode=${d.mode} first host=${d.host} user=${d.user} database=${d.database} passwordLength=${d.passwordLength} candidateCount=${buildCandidates().length}`
  );
}

export async function initDatabase(): Promise<void> {
  if (poolInstance) return;

  logDatabaseEnvChecklist();
  logDatabaseDiagnostics();

  const candidates = buildCandidates();
  if (candidates.length === 0) {
    throw new Error(
      'No database configuration found. On Railway bot service add References from PostgreSQL: DATABASE_PRIVATE_URL (easiest), or all of PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT. Delete any pasted/stale DATABASE_URL.'
    );
  }

  const errors: string[] = [];

  for (const candidate of candidates) {
    const testPool = new Pool(candidate.config);
    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();

      poolInstance = testPool;
      connectionMode = candidate.mode;
      console.log(`[db] connected successfully via ${candidate.mode}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${candidate.mode}: ${msg}`);
      await testPool.end().catch(() => {});
    }
  }

  throw new Error(
    `All database connection attempts failed:\n${errors.join('\n')}\n\n` +
      'Railway fix: (1) Delete DATABASE_URL, PGPASSWORD, and all PG* on the BOT service. ' +
      '(2) Postgres → Connect → select bot. ' +
      '(3) Or add ONE reference: DATABASE_PRIVATE_URL on the bot. ' +
      '(4) Postgres Settings → Reset Credentials → Connect again → redeploy bot.'
  );
}

export function getPool(): Pool {
  if (!poolInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return poolInstance;
}

/** @deprecated use getPool() after initDatabase() */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const p = getPool() as unknown as Record<string | symbol, unknown>;
    const value = p[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(getPool()) : value;
  },
});

export async function verifyDatabaseConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
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
  const db = getPool();
  await db.query(`
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
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (applied.rowCount && applied.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const client = await db.connect();
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
