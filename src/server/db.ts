import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

/**
 * Postgres access (Supabase). The server connects directly with DATABASE_URL
 * and enforces permissions in code. On Vercel, use Supabase's transaction
 * pooler URL (port 6543); prepared statements are disabled for compatibility.
 *
 * Queries use `?` placeholders, which are converted to `$1, $2, …`.
 */

type Sql = postgres.Sql;
type G = typeof globalThis & { __meetiDb?: { url: string; sql: Sql } };

/**
 * Serverless hosts pause instances between requests, and pooled connections can
 * be silently dropped while paused. A query sent on such a dead socket never
 * gets an answer, so every query has a time limit: on timeout the connection
 * pool is thrown away, and read-only queries are retried once on a fresh one.
 */
const QUERY_TIMEOUT_MS = Number(process.env.DATABASE_QUERY_TIMEOUT_MS || 8000);
const TX_TIMEOUT_MS = Number(process.env.DATABASE_TX_TIMEOUT_MS || 15000);

export class DbTimeoutError extends Error {
  name = "DbTimeoutError";
}

const POOL_MAX = Number(process.env.DATABASE_POOL_MAX || 5);

/**
 * At most POOL_MAX queries in flight per server instance. postgres.js would
 * otherwise pipeline extra queries onto busy connections, and Supabase's
 * transaction pooler can leave pipelined queries unanswered under bursts.
 */
let active = 0;
const waiting: (() => void)[] = [];
async function acquire() {
  while (active >= POOL_MAX) await new Promise<void>((r) => waiting.push(r));
  active++;
}
function release() {
  active--;
  waiting.shift()?.();
}
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

function connect(url: string): Sql {
  return postgres(url, {
    prepare: false,
    max: POOL_MAX,
    // Short-lived connections suit serverless: fewer chances to reuse a dropped one.
    idle_timeout: 10,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    // Timestamps are stored as epoch-millisecond bigints; return them as numbers.
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
    // Surface warnings (e.g. realtime.send() failures) but skip routine notices.
    onnotice: (n) => {
      if (n.severity === "WARNING") console.warn("[meeti] postgres warning:", n.message);
    },
  });
}

export function sql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example for how to connect Meeti to Supabase.");
  const g = globalThis as G;
  // Reconnect if the URL changed (e.g. .env.local edited while the dev server runs).
  if (g.__meetiDb?.url !== url) {
    void g.__meetiDb?.sql?.end({ timeout: 1 });
    g.__meetiDb = { url, sql: connect(url) };
  }
  return g.__meetiDb.sql;
}

/** Drop a pool that may hold dead connections; the next query reconnects. */
function resetPool(stale: Sql) {
  const g = globalThis as G;
  if (g.__meetiDb?.sql === stale) g.__meetiDb = undefined;
  stale.end({ timeout: 0 }).catch(() => {});
}

async function withTimeout<T>(work: PromiseLike<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DbTimeoutError(`Database ${what} timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const txStore = new AsyncLocalStorage<postgres.TransactionSql>();

export type Param = string | number | boolean | null;
export type Row = Record<string, unknown>;

function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

const isRetryableRead = (query: string) => /^\s*select\b/i.test(query) && !/realtime\.send/i.test(query);

async function exec<T>(query: string, params: Param[]): Promise<T[]> {
  const text = toPg(query);
  const args = params as postgres.ParameterOrJSON<never>[];
  const label = query.replace(/\s+/g, " ").trim().slice(0, 60);
  const t = txStore.getStore();
  // Inside a transaction, the transaction's own time limit applies.
  if (t) return t.unsafe(text, args) as unknown as Promise<T[]>;

  return limited(() => execOutsideTx<T>(query, text, args, label));
}

async function execOutsideTx<T>(query: string, text: string, args: postgres.ParameterOrJSON<never>[], label: string): Promise<T[]> {
  const client = sql();
  try {
    return (await withTimeout(client.unsafe(text, args), QUERY_TIMEOUT_MS, `query "${label}"`)) as unknown as T[];
  } catch (e) {
    let retry: boolean;
    if (e instanceof DbTimeoutError) {
      console.warn(`[meeti] ${e.message}; resetting connections`);
      resetPool(client);
      retry = isRetryableRead(query);
    } else if (isDroppedConnection(e)) {
      // The connection died under this query (e.g. another request reset the pool).
      // Reads are always safe to repeat; writes only if they never reached the server.
      resetPool(client);
      retry = isRetryableRead(query) || neverSent(e);
    } else throw e;
    if (!retry) throw e;
    return (await withTimeout(sql().unsafe(text, args), QUERY_TIMEOUT_MS, `query "${label}" (retry)`)) as unknown as T[];
  }
}

const DROPPED = new Set(["CONNECTION_DESTROYED", "CONNECTION_CLOSED", "CONNECTION_ENDED", "ECONNRESET", "EPIPE"]);
function isDroppedConnection(e: unknown): boolean {
  return DROPPED.has((e as { code?: string })?.code ?? "");
}
/** postgres.js reports "write CONNECTION_…" when the query couldn't be sent at all. */
function neverSent(e: unknown): boolean {
  return /^write /.test((e as Error)?.message ?? "");
}

export async function q<T = Row>(query: string, ...params: Param[]): Promise<T[]> {
  return exec<T>(query, params);
}

export async function one<T = Row>(query: string, ...params: Param[]): Promise<T | undefined> {
  return (await exec<T>(query, params))[0];
}

export async function run(query: string, ...params: Param[]): Promise<void> {
  await exec(query, params);
}

/** Run `fn` in a transaction; q/one/run inside it use the transaction automatically. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const client = sql();
  try {
    // A transaction holds one connection for its whole duration.
    return (await limited(() =>
      withTimeout(
        client.begin((t) => txStore.run(t, fn)),
        TX_TIMEOUT_MS,
        "transaction",
      ),
    )) as T;
  } catch (e) {
    if (e instanceof DbTimeoutError) {
      console.warn(`[meeti] ${e.message}; resetting connections`);
      resetPool(client);
    }
    throw e;
  }
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export const now = () => Date.now();
