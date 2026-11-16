import "server-only";
import { run } from "./db";

/**
 * Realtime via Supabase private broadcast channels.
 * Topics: `user:<id>`, `group:<id>`, `hangout:<id>`. The server publishes with
 * realtime.send(); browsers subscribe with their own session, and the
 * realtime.messages policies (see the migration) decide who may receive what.
 * Presence ("online") is tracked client-side on group channels.
 */

export type RealtimeEvent = { type: string; [k: string]: unknown };

export async function publish(topic: string, event: RealtimeEvent): Promise<void> {
  try {
    await run("SELECT realtime.send((?::text)::jsonb, 'event', ?, true)", JSON.stringify(event), topic);
  } catch (e) {
    // A missed realtime event shouldn't fail the request; clients resync on reconnect.
    console.warn("[meeti] realtime publish failed:", (e as Error).message);
  }
}
