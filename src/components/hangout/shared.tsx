"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { when } from "@/lib/client/format";
import { CATEGORIES, MODES, type HangoutDetail, type LiveShare, type TravelState } from "@/lib/types";

export type Mutate = (data?: HangoutDetail | ((cur?: HangoutDetail) => HangoutDetail | undefined), opts?: { revalidate?: boolean }) => Promise<unknown>;

export const categoryEmoji = (c: string | null) => CATEGORIES.find((x) => x.id === c)?.emoji ?? "📍";
export const modeOf = (m: string) => MODES.find((x) => x.id === m)!;

export function travelState(share?: LiveShare | null): TravelState {
  if (share?.arrivedAt) return "arrived";
  if (!share || share.status === "stopped" || share.status === "expired") return "not_sharing";
  if (share.status === "paused") return "paused";
  if (share.startedMovingAt) return "on_the_way";
  return "not_started";
}

export const STATE_UI: Record<TravelState, { label: string; cls: string }> = {
  arrived: { label: "Arrived", cls: "bg-mint/15 text-[#0f8a5f]" },
  on_the_way: { label: "On the way", cls: "bg-volt text-ink" },
  not_started: { label: "Not started", cls: "bg-soft text-muted" },
  not_sharing: { label: "Not started", cls: "bg-soft text-muted" },
  paused: { label: "Paused", cls: "bg-amber/20 text-[#8a5a00]" },
};

const STEPS = [
  { id: "start", label: "Start points" },
  { id: "places", label: "Places" },
  { id: "vote", label: "Vote" },
  { id: "live", label: "Go" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export function Stepper({ active, onPick, done }: { active: StepId; onPick?: (s: StepId) => void; done: Partial<Record<StepId, boolean>> }) {
  return (
    <div className="flex gap-1.5">
      {STEPS.map((s, i) => {
        const isActive = s.id === active;
        const clickable = !!onPick && s.id !== "live";
        return (
          <button
            key={s.id}
            disabled={!clickable}
            onClick={() => onPick?.(s.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-bold transition ${
              isActive ? "bg-ink text-white" : done[s.id] ? "bg-volt text-ink" : "bg-white text-muted shadow-card"
            } ${clickable ? "" : "cursor-default"}`}
          >
            <span className={`grid h-4.5 w-4.5 place-items-center rounded-full text-[10px] ${isActive ? "bg-volt text-ink" : done[s.id] ? "bg-ink text-volt" : "bg-soft"}`}>
              {done[s.id] && !isActive ? "✓" : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HangoutHeader({ h }: { h: HangoutDetail }) {
  return (
    <div>
      <Link href={`/groups/${h.group.id}`} className="btn btn-ghost btn-sm -ml-3 text-muted">
        <ArrowLeft className="h-4 w-4" /> {h.group.emoji} {h.group.name}
      </Link>
      <h1 className="font-display mt-1 text-3xl font-extrabold leading-tight">{h.title}</h1>
      <p className="mt-0.5 text-sm font-semibold text-muted">
        {when(h.startsAt)} · {modeOf(h.mode).emoji} {modeOf(h.mode).label} by default
      </p>
    </div>
  );
}
