"use client";
import { useEffect, useRef } from "react";
import { subscribeTopic, type LiveEvent } from "./realtime";

export type { LiveEvent };

/** Subscribe to realtime events on the given topics (user:…, group:…, hangout:…). */
export function useEvents(onEvent: (e: LiveEvent) => void, topics: (string | null | undefined)[]) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const key = topics.filter(Boolean).sort().join(",");
  useEffect(() => {
    if (!key) return;
    const offs = key.split(",").map((t) => subscribeTopic(t, { onEvent: (e) => handler.current(e) }));
    return () => offs.forEach((off) => off());
  }, [key]);
}
