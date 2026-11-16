import "server-only";
import { EventEmitter } from "node:events";
import { now, run } from "./db";

/**
 * In-process pub/sub used by the SSE endpoint. Topics look like
 * `group:<id>`, `hangout:<id>`, `user:<id>`.
 *
 * This works for a single server process. To scale horizontally, replace
 * `publish`/`subscribe` with Redis pub/sub, Postgres LISTEN/NOTIFY, or a
 * hosted realtime service; nothing else in the app needs to change.
 */

export type RealtimeEvent = { type: string; [k: string]: unknown };

type State = { bus: EventEmitter; connections: Map<string, number> };
type G = typeof globalThis & { __where2rt?: State };

function state(): State {
  const g = globalThis as G;
  if (!g.__where2rt) {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    g.__where2rt = { bus, connections: new Map() };
  }
  return g.__where2rt;
}

export function publish(topic: string, event: RealtimeEvent) {
  state().bus.emit(topic, event);
}

export function subscribe(topic: string, fn: (e: RealtimeEvent) => void) {
  const { bus } = state();
  bus.on(topic, fn);
  return () => bus.off(topic, fn);
}

/** Presence: a user is online while they hold at least one open event stream. */
export function connect(userId: string): boolean {
  const { connections } = state();
  const n = (connections.get(userId) ?? 0) + 1;
  connections.set(userId, n);
  run("UPDATE users SET last_seen_at = ? WHERE id = ?", now(), userId);
  return n === 1;
}

export function disconnect(userId: string): boolean {
  const { connections } = state();
  const n = (connections.get(userId) ?? 1) - 1;
  if (n <= 0) connections.delete(userId);
  else connections.set(userId, n);
  run("UPDATE users SET last_seen_at = ? WHERE id = ?", now(), userId);
  return n <= 0;
}

export function isOnline(userId: string): boolean {
  return (state().connections.get(userId) ?? 0) > 0;
}
