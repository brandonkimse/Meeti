"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { clock, dayLabel } from "@/lib/client/format";
import type { HangoutDetail } from "@/lib/types";
import { PlaceCover } from "../PlaceCover";
import { Avatar, Spinner, useToast } from "../ui";
import { HangoutHeader, type Mutate } from "./shared";

export function RecapView({ h, mutate }: { h: HangoutDetail; mutate?: Mutate }) {
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
      <NextSteps h={h} mutate={mutate} />
    </div>
  );
}

/** After a hangout: keep the crew together for next time. */
function NextSteps({ h, mutate }: { h: HangoutDetail; mutate?: Mutate }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(h.title.length < 30 ? `${h.title} crew` : "Our crew");
  const [busy, setBusy] = useState(false);

  // Guests: offer an account, which keeps everything they did as a guest.
  if (h.me.isGuest)
    return (
      <div className="card mt-5 p-5 text-center">
        <div className="text-3xl">💾</div>
        <div className="font-display mt-1 text-lg font-bold">Keep this crew</div>
        <p className="mt-1 text-sm text-muted">Create a free account to save this hangout and plan the next one together in seconds.</p>
        <Link href={`/signup?next=${encodeURIComponent(`/p/${h.shareCode}`)}`} className="btn btn-volt btn-lg mt-4 w-full">
          Create my account
        </Link>
      </div>
    );

  if (h.group)
    return (
      <Link href={`/groups/${h.group.id}/plan`} className="btn btn-volt btn-lg mt-5 w-full">
        Plan the next one
      </Link>
    );

  const isHost = h.createdBy === h.me.id;
  return (
    <div className="mt-5 space-y-2">
      {isHost && h.participants.length > 1 && (
        <form
          className="card p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api<{ groupId: string }>(`/api/hangouts/${h.id}/save-group`, { body: { name, emoji: "✨" } });
              await mutate?.();
              toast("Crew saved as a group");
              router.push(`/groups/${r.groupId}`);
              router.refresh();
            } catch (err) {
              toast((err as Error).message, "error");
              setBusy(false);
            }
          }}
        >
          <div className="font-display font-bold">Save this crew as a group?</div>
          <p className="mb-3 mt-0.5 text-sm text-muted">Next time, start a plan with everyone already in it. Guests can join when they create an account.</p>
          <div className="flex gap-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} aria-label="Group name" />
            <button className="btn btn-ink shrink-0" disabled={busy || !name.trim()}>
              {busy ? <Spinner className="h-4 w-4" /> : "Save"}
            </button>
          </div>
        </form>
      )}
      <Link href="/plan" className="btn btn-volt btn-lg w-full">
        Plan the next one
      </Link>
    </div>
  );
}
