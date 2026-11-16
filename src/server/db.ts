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

function connect(url: string): Sql {
  return postgres(url, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idle_timeout: 20,
    connect_timeout: 15,
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

const txStore = new AsyncLocalStorage<postgres.TransactionSql>();

export type Param = string | number | boolean | null;
export type Row = Record<string, unknown>;

function toPg(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

function exec<T>(query: string, params: Param[]): Promise<T[]> {
  const conn = txStore.getStore() ?? sql();
  return conn.unsafe(toPg(query), params as postgres.ParameterOrJSON<never>[]) as unknown as Promise<T[]>;
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
  return (await sql().begin((t) => txStore.run(t, fn))) as T;
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export const now = () => Date.now();
