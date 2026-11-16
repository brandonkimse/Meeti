"use client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Shared Supabase Realtime channels, ref-counted per topic so several
 * components can listen to the same topic over one connection.
 * - Broadcast event "event" carries server events.
 * - Group channels also carry presence (who's online).
 */

export type LiveEvent = { type: string; [k: string]: unknown };
type Handlers = { onEvent?: (e: LiveEvent) => void; onPresence?: (online: Set<string>) => void };
type Entry = { channel: RealtimeChannel; handlers: Set<Handlers>; subscribedOnce: boolean; online: Set<string> };

const entries = new Map<string, Entry>();
let identity: string | null = null;
let authReady: Promise<void> | null = null;

/** The signed-in user's id, used as their presence key. */
export function setRealtimeIdentity(userId: string) {
  identity = userId;
}

function ensureAuth() {
  // Private channels need the user's access token on the realtime socket.
  authReady ??= supabaseBrowser()
    .realtime.setAuth()
    .catch(() => {});
  return authReady;
}

function open(topic: string): Entry {
  const client = supabaseBrowser();
  const isGroup = topic.startsWith("group:");
  const channel = client.channel(topic, {
    config: { private: true, ...(isGroup && identity ? { presence: { key: identity } } : {}) },
  });
  const entry: Entry = { channel, handlers: new Set(), subscribedOnce: false, online: new Set() };

  channel.on("broadcast", { event: "event" }, ({ payload }) => {
    for (const h of entry.handlers) h.onEvent?.(payload as LiveEvent);
  });
  if (isGroup) {
    channel.on("presence", { event: "sync" }, () => {
      entry.online = new Set(Object.keys(channel.presenceState()));
      for (const h of entry.handlers) h.onPresence?.(entry.online);
    });
  }

  void ensureAuth().then(() =>
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // After a reconnect, let listeners refetch anything they missed.
      if (entry.subscribedOnce) for (const h of entry.handlers) h.onEvent?.({ type: "resync" });
      entry.subscribedOnce = true;
      if (isGroup && identity) void channel.track({ at: Date.now() });
    }),
  );
  entries.set(topic, entry);
  return entry;
}

export function subscribeTopic(topic: string, handlers: Handlers): () => void {
  const entry = entries.get(topic) ?? open(topic);
  entry.handlers.add(handlers);
  if (entry.online.size) handlers.onPresence?.(entry.online);
  return () => {
    entry.handlers.delete(handlers);
    if (entry.handlers.size === 0) {
      // Keep group channels briefly in case another page re-subscribes right away.
      setTimeout(() => {
        if (entry.handlers.size === 0 && entries.get(topic) === entry) {
          entries.delete(topic);
          void supabaseBrowser().removeChannel(entry.channel);
        }
      }, 1500);
    }
  };
}
