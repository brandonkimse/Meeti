"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setRealtimeIdentity, subscribeTopic } from "@/lib/client/realtime";

const OnlineCtx = createContext<Set<string>>(new Set());

/** Tracks who's online across all of the user's groups via Realtime presence. */
export function OnlineProvider({ meId, groupIds, children }: { meId: string; groupIds: string[]; children: ReactNode }) {
  const [byGroup, setByGroup] = useState<Record<string, string[]>>({});
  const key = [...groupIds].sort().join(",");

  useEffect(() => {
    setRealtimeIdentity(meId);
    if (!key) return;
    const offs = key.split(",").map((g) =>
      subscribeTopic(`group:${g}`, { onPresence: (online) => setByGroup((cur) => ({ ...cur, [g]: [...online] })) }),
    );
    return () => offs.forEach((off) => off());
  }, [meId, key]);

  const online = new Set(Object.values(byGroup).flat());
  online.add(meId);
  return <OnlineCtx.Provider value={online}>{children}</OnlineCtx.Provider>;
}

/** Returns a checker: is this user online right now? Demo friends report themselves as online. */
export function useIsOnline() {
  const set = useContext(OnlineCtx);
  return (u: { id: string; online?: boolean }) => !!u.online || set.has(u.id);
}
