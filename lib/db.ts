import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * One tiny query interface over two backends:
 *  - DATABASE_URL set  -> real Postgres (Supabase, Neon, RDS, your own server)
 *  - DATABASE_URL unset -> embedded Postgres (PGlite) stored in ./.data, zero setup
 * Both speak the same SQL, so there is exactly one code path to test.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

// Idempotent: safe to run on every cold start.
const SCHEMA = [
  `create table if not exists courses (
    id text primary key,
    code text not null unique,
    name text not null,
    instructor text not null default '',
    admin_key_hash text not null unique,
    timezone text not null default 'UTC',
    open_question text not null default 'What''s one thing from today that''s still unclear?',
    class_size integer check (class_size is null or class_size between 1 and 2000),
    is_open boolean not null default true,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists responses (
    id integer generated always as identity primary key,
    course_id text not null references courses(id) on delete cascade,
    session_date date not null,
    device_hash text not null,
    ip_hash text not null default '',
    rating smallint check (rating between 1 and 5),
    pace smallint check (pace between -1 and 1),
    comment text check (char_length(comment) <= 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (course_id, session_date, device_hash)
  )`,
  // Added after the first release; `if not exists` keeps older databases working.
  `alter table courses add column if not exists creator_ip_hash text not null default ''`,
  `create index if not exists courses_creator_idx on courses (creator_ip_hash, created_at)`,
  // Server-side secrets (e.g. the random key used to hash IPs). Never sent to clients.
  `create table if not exists settings (
    key text primary key,
    value text not null
  )`,
  // On Supabase, tables in `public` are exposed through the auto-generated REST API.
  // RLS with no policies closes that door; this app connects as the table owner, which bypasses RLS.
  `alter table courses enable row level security`,
  `alter table responses enable row level security`,
  `alter table settings enable row level security`,
];

declare global {
  var __classFeedbackLastPrune: number | undefined;
}

/**
 * IP hashes only serve short-term spam limits, so wipe them after 2 days.
 * Called (without awaiting) from the write routes; runs at most once an hour per server process.
 */
export async function pruneIpHashes(db: Db): Promise<void> {
  const now = Date.now();
  if (globalThis.__classFeedbackLastPrune && now - globalThis.__classFeedbackLastPrune < 3_600_000) return;
  globalThis.__classFeedbackLastPrune = now;
  try {
    await db.query(`update responses set ip_hash = '' where ip_hash <> '' and session_date < current_date - 2`);
    await db.query(
      `update courses set creator_ip_hash = '' where creator_ip_hash <> '' and created_at < now() - interval '2 days'`,
    );
  } catch {
    globalThis.__classFeedbackLastPrune = undefined; // try again on the next request
  }
}

async function connectPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const sql = postgres(url, {
    // Transaction poolers (Supabase :6543, PgBouncer) don't support prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    // Require TLS for remote databases unless the URL says otherwise (e.g. ?sslmode=disable).
    // The key must be absent, not undefined, for the URL's sslmode to apply.
    ...(local || /sslmode=/.test(url) ? {} : { ssl: "require" as const }),
  });
  await sql.begin(async (tx) => {
    // Serialise schema setup when many serverless instances cold-start at once.
    await tx.unsafe("select pg_advisory_xact_lock(727274)");
    for (const stmt of SCHEMA) await tx.unsafe(stmt);
  });
  return {
    query: async (text, params = []) =>
      (await sql.unsafe(text, params as never[])) as unknown as never[],
  };
}

async function connectEmbedded(): Promise<Db> {
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set. On Vercel the filesystem is read-only, so add a Postgres " +
        "connection string (e.g. from Supabase) as DATABASE_URL in your project settings.",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
  for (const stmt of SCHEMA) await pg.exec(stmt);
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows as never[],
  };
}

declare global {
  // Survives dev-server hot reloads, so we never open the embedded database twice.
  var __classFeedbackDb: Promise<Db> | undefined;
}

export function getDb(): Promise<Db> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    // Opening the embedded database from a build worker while the app is running corrupts it.
    // Anything that reaches here at build time must call `await connection()` first.
    return Promise.reject(new Error("Database accessed during `next build`; add `await connection()` before it."));
  }
  if (!globalThis.__classFeedbackDb) {
    const url = process.env.DATABASE_URL?.trim();
    const pending = url ? connectPostgres(url) : connectEmbedded();
    // A failed connection shouldn't be cached forever; let the next request retry.
    pending.catch(() => {
      if (globalThis.__classFeedbackDb === pending) globalThis.__classFeedbackDb = undefined;
    });
    globalThis.__classFeedbackDb = pending;
  }
  return globalThis.__classFeedbackDb;
}
