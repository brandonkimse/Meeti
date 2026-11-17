"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { useEvents } from "@/lib/client/useEvents";
import type { HangoutDetail, LatLng, LiveShare } from "@/lib/types";
import { ErrorState, PageLoader, useToast } from "../ui";
import { LiveView } from "./LiveView";
import { PlanningView } from "./PlanningView";
import { RecapView } from "./RecapView";

/**
 * A plan in any phase. Signed-in people get instant updates over Realtime;
 * guests (no Supabase session) refresh every few seconds instead.
 */
export function HangoutScreen({ id, guest = false }: { id: string; guest?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const prevStatus = useRef<string | null>(null);
  // Short breadcrumb trail per friend so the map shows them getting closer.
  const [trails, setTrails] = useState<Record<string, LatLng[]>>({});

  const addTrail = useCallback((share: LiveShare) => {
    setTrails((t) => {
      if (share.status !== "active" || share.lat == null || share.lng == null) {
        if (!t[share.userId]) return t;
        const rest = { ...t };
        delete rest[share.userId];
        return rest;
      }
      const cur = t[share.userId] ?? [];
      const last = cur[cur.length - 1];
      if (last && last.lat === share.lat && last.lng === share.lng) return t;
      return { ...t, [share.userId]: [...cur, { lat: share.lat, lng: share.lng }].slice(-80) };
    });
  }, []);

  const { data: h, error, mutate } = useSWR<HangoutDetail>(`/api/hangouts/${id}`, fetcher, {
    refreshInterval: guest ? 4000 : 0,
    onSuccess: (d) => {
      const prev = prevStatus.current;
      if (prev === "planning" && d.status === "live" && d.destination) toast(`📍 It's decided: ${d.destination.name}!`);
      if (prev === "live" && d.status === "completed") toast("Hangout complete. Location sharing has ended.");
      prevStatus.current = d.status;
      d.shares.forEach(addTrail);
    },
  });

  useEvents(
    (e) => {
      if (e.type === "location") {
        const share = e.share as LiveShare;
        addTrail(share);
        mutate(
          (cur) =>
            cur && {
              ...cur,
              shares: [...cur.shares.filter((s) => s.userId !== share.userId), share],
              me: cur.me.id === share.userId ? { ...cur.me, share } : cur.me,
            },
          { revalidate: false },
        );
        return;
      }
      if (e.type === "hangout.deleted" && e.hangoutId === id) {
        toast("This hangout was deleted.");
        router.replace(guest ? "/" : "/home");
        return;
      }
      if ((e as { hangoutId?: string }).hangoutId === id || e.type === "resync") mutate();
    },
    guest ? [] : [`hangout:${id}`],
  );

  if (error)
    return (
      <ErrorState
        message="This hangout doesn't exist or you don't have access."
        action={
          <Link href={guest ? "/" : "/home"} className="btn btn-ink">
            {guest ? "Go to Meeti" : "Go home"}
          </Link>
        }
      />
    );
  if (!h) return <PageLoader />;

  return (
    <div key={h.status}>
      {h.status === "planning" && <PlanningView h={h} mutate={mutate} />}
      {h.status === "live" && h.destination && <LiveView h={h} mutate={mutate} trails={trails} />}
      {(h.status === "completed" || h.status === "cancelled") && <RecapView h={h} mutate={mutate} />}
    </div>
  );
}
