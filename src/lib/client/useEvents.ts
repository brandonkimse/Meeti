"use client";
import { useEffect, useRef } from "react";

export type LiveEvent = { type: string; [k: string]: unknown };

/** Subscribe to the server event stream. Reconnects automatically. */
export function useEvents(onEvent: (e: LiveEvent) => void, opts: { hangout?: string } = {}) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const url = `/api/events${opts.hangout ? `?hangout=${encodeURIComponent(opts.hangout)}` : ""}`;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let first = true;
    const open = () => {
      es = new EventSource(url);
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as LiveEvent;
          // After a reconnect, refetch everything that might have changed.
          if (e.type === "ready" && !first) handler.current({ type: "resync" });
          if (e.type === "ready") first = false;
          handler.current(e);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        es?.close();
        if (!closed) retry = setTimeout(open, 2500);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [opts.hangout]);
}
