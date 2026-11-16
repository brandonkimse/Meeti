import "server-only";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Persistence layer. Uses Node's built-in SQLite so Where2 runs with zero
 * external services. All access goes through `q`/`one`/`run`, so swapping in
 * Postgres later means re-implementing this file (and the SQL dialect bits).
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  avatar_url TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  emoji TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS hangouts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  final_suggestion_id TEXT,
  dest_name TEXT,
  dest_address TEXT,
  dest_lat REAL,
  dest_lng REAL,
  dest_image_url TEXT,
  poll_closes_at INTEGER,
  recommendations_json TEXT,
  recommendations_key TEXT,
  created_at INTEGER NOT NULL,
  finalized_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS participants (
  hangout_id TEXT NOT NULL REFERENCES hangouts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp TEXT NOT NULL DEFAULT 'going',
  origin_lat REAL,
  origin_lng REAL,
  origin_label TEXT,
  origin_source TEXT,
  mode TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (hangout_id, user_id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  hangout_id TEXT NOT NULL REFERENCES hangouts(id) ON DELETE CASCADE,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  category TEXT,
  image_url TEXT,
  rating REAL,
  rating_count INTEGER,
  external_id TEXT,
  travel_json TEXT,
  travel_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  hangout_id TEXT NOT NULL REFERENCES hangouts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (hangout_id, user_id)
);

CREATE TABLE IF NOT EXISTS location_shares (
  hangout_id TEXT NOT NULL REFERENCES hangouts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lat REAL,
  lng REAL,
  accuracy REAL,
  updated_at INTEGER,
  eta_s REAL,
  distance_m REAL,
  eta_source TEXT,
  eta_computed_at INTEGER,
  started_moving_at INTEGER,
  arrived_at INTEGER,
  PRIMARY KEY (hangout_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_hangouts_group ON hangouts(group_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_hangout ON suggestions(hangout_id);
`;

type G = typeof globalThis & { __where2db?: DatabaseSync };

function open(): DatabaseSync {
  const dir = process.env.WHERE2_DATA_DIR || path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "where2.db"));
  db.exec(SCHEMA);
  return db;
}

export function db(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__where2db) g.__where2db = open();
  return g.__where2db;
}

export type Row = Record<string, unknown>;

export function q<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function one<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return db().prepare(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export const now = () => Date.now();
