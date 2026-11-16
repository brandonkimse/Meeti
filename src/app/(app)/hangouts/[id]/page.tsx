"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { LiveView } from "@/components/hangout/LiveView";
import { PlanningView } from "@/components/hangout/PlanningView";
import { RecapView } from "@/components/hangout/RecapView";
import { ErrorState, PageLoader, useToast } from "@/components/ui";
import { fetcher } from "@/lib/client/api";
import { useEvents } from "@/lib/client/useEvents";
import type { HangoutDetail, LatLng, LiveShare } from "@/lib/types";

export default function HangoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const prevStatus = useRef<string | null>(null);
  const { data: h, error, mutate } = useSWR<HangoutDetail>(`/api/hangouts/${id}`, fetcher, {
    onSuccess: (d) => {
      const prev = prevStatus.current;
      if (prev === "planning" && d.status === "live" && d.destination) toast(`📍 It's decided: ${d.destination.name}!`);
      if (prev === "live" && d.status === "completed") toast("Hangout complete. Location sharing has ended.");
      prevStatus.current = d.status;
    },
  });
  // Short breadcrumb trail per friend so the map shows them getting closer.
  const [trails, setTrails] = useState<Record<string, LatLng[]>>({});

  useEvents(
    (e) => {
      if (e.type === "location") {
        const share = e.share as LiveShare;
        setTrails((t) => {
          if (share.status !== "active" || share.lat == null || share.lng == null) {
            const rest = { ...t };
            delete rest[share.userId];
            return rest;
          }
          return { ...t, [share.userId]: [...(t[share.userId] ?? []), { lat: share.lat, lng: share.lng }].slice(-80) };
        });
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
        toast("This hangout was cancelled.");
        router.replace("/home");
        return;
      }
      if ((e as { hangoutId?: string }).hangoutId === id || e.type === "resync") mutate();
    },
    [`hangout:${id}`],
  );

  if (error)
    return (
      <ErrorState
        message="This hangout doesn't exist or you don't have access."
        action={
          <Link href="/home" className="btn btn-ink">
            Go home
          </Link>
        }
      />
    );
  if (!h) return <PageLoader />;

  return (
    <div key={h.status}>
      {h.status === "planning" && <PlanningView h={h} mutate={mutate} />}
      {h.status === "live" && h.destination && <LiveView h={h} mutate={mutate} trails={trails} />}
      {(h.status === "completed" || h.status === "cancelled") && <RecapView h={h} />}
    </div>
  );
}
