"use client";

import Link from "next/link";
import { clock, dayLabel } from "@/lib/client/format";
import type { HangoutDetail } from "@/lib/types";
import { PlaceCover } from "../PlaceCover";
import { Avatar } from "../ui";
import { HangoutHeader } from "./shared";

export function RecapView({ h }: { h: HangoutDetail }) {
  const arrivals = h.participants
    .map((p) => ({ p, at: h.shares.find((s) => s.userId === p.user.id)?.arrivedAt ?? null }))
    .filter((x) => x.p.rsvp !== "declined")
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  const first = arrivals.find((a) => a.at);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-5 sm:px-6">
      <HangoutHeader h={h} />
      <div className="card mt-5 animate-rise overflow-hidden">
        <div className="relative h-44">
          <PlaceCover imageUrl={h.destination?.imageUrl ?? null} category={h.category} seed={h.destination?.suggestionId ?? h.id} label={h.destination?.name} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="text-xs font-bold uppercase tracking-wider text-volt">That&apos;s a wrap 🎉</div>
            <div className="font-display text-2xl font-extrabold">{h.destination?.name ?? "Hangout complete"}</div>
            {h.destination?.address && <div className="text-sm text-white/80">{h.destination.address}</div>}
          </div>
        </div>
        <div className="p-4">
          <div className="text-sm text-muted">
            {dayLabel(h.startsAt)} · {arrivals.length} {arrivals.length === 1 ? "person" : "people"}
            {first && ` · ${first.p.user.id === h.me.id ? "You" : first.p.user.name.split(" ")[0]} got there first 🏆`}
          </div>
          <div className="mt-4 space-y-2">
            {arrivals.map(({ p, at }) => (
              <div key={p.user.id} className="flex items-center gap-3">
                <Avatar user={p.user} size={34} />
                <span className="flex-1 text-sm font-semibold">{p.user.id === h.me.id ? "You" : p.user.name}</span>
                <span className="text-xs text-muted">{at ? `Arrived ${clock(at)}` : "No arrival recorded"}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-soft px-3 py-2 text-xs text-muted">🔒 Live location sharing has ended, and everyone&apos;s live coordinates have been deleted.</p>
        </div>
      </div>
      <Link href={`/groups/${h.group.id}/plan`} className="btn btn-volt btn-lg mt-5 w-full">
        Plan the next one
      </Link>
    </div>
  );
}
