import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";

/**
 * Runtime database access.
 *
 * The app ALWAYS connects as `caselab_app`, a non-superuser role, so Row Level Security
 * applies to every query. It never uses the owner credentials in DATABASE_URL directly:
 * it takes the host/port/database from there and swaps in caselab_app + APP_DB_PASSWORD.
 * (APP_DATABASE_URL, if set, overrides this — e.g. for a separate connection pooler.)
 */
export function appDatabaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  if (!env.DATABASE_URL || !env.APP_DB_PASSWORD) return null;
  const u = new URL(env.DATABASE_URL);
  u.username = "caselab_app";
  u.password = env.APP_DB_PASSWORD;
  return u.toString();
}

export const dbConfigured = () => appDatabaseUrl() !== null;

export const SETUP_MESSAGE =
  "The database isn't configured yet. Set DATABASE_URL and APP_DB_PASSWORD (see .env.example), then run npm run db:setup.";

const globalForDb = globalThis as unknown as { caselabSql?: Sql };

function client(): Sql {
  if (globalForDb.caselabSql) return globalForDb.caselabSql;
  const url = appDatabaseUrl();
  if (!url) throw new Error(SETUP_MESSAGE);
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".railway.internal");
  // DB_POOL_MAX=1 for a local PGlite server (one shared session: parallel connections collide).
  const max = Math.min(Math.max(Number(process.env.DB_POOL_MAX) || 10, 1), 50);
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : "prefer",
    onnotice: () => {},
  });
  globalForDb.caselabSql = sql; // one pool per process, reused across dev hot reloads
  return sql;
}

/**
 * Run queries as a user (or signed out, with null). Everything happens inside one transaction
 * whose first statement sets app.user_id, which every RLS policy reads. The setting is
 * transaction-local, so it can never leak to another request sharing the pooled connection.
 */
export async function withUser<T>(userId: string | null, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return client().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId ?? ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
