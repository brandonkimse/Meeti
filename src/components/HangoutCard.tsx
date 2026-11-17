"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { when } from "@/lib/client/format";
import { MODES, type HangoutListItem } from "@/lib/types";
import { HangoutActions, type HangoutAction } from "./HangoutActions";
import { PlaceCover } from "./PlaceCover";

const STATUS: Record<HangoutListItem["status"], { label: string; cls: string }> = {
  planning: { label: "Planning", cls: "bg-soft text-ink" },
  live: { label: "● Live", cls: "bg-volt text-ink" },
  completed: { label: "Done", cls: "bg-soft text-muted" },
  cancelled: { label: "Cancelled", cls: "bg-soft text-muted" },
};

export function HangoutCard({ h, showGroup = false, onChanged }: { h: HangoutListItem; showGroup?: boolean; onChanged?: (a: HangoutAction) => void }) {
  const s = STATUS[h.status];
  const mode = MODES.find((m) => m.id === h.mode);
  return (
    <div className={`card group flex items-center gap-1 pr-2 transition-transform hover:-translate-y-0.5 ${h.status === "live" ? "ring-2 ring-volt-deep" : ""}`}>
    <Link href={`/hangouts/${h.id}`} className="flex min-w-0 flex-1 items-center gap-3.5 p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl">
        <PlaceCover category={h.category} imageUrl={h.destImageUrl} seed={h.id} compact />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>
          {showGroup && h.groupName && <span className="truncate text-xs font-semibold text-muted">{h.groupName}</span>}
        </div>
        <div className="font-display mt-1 truncate text-[17px] font-bold">{h.title}</div>
        <div className="truncate text-sm text-muted">
          {when(h.startsAt)} · {mode?.emoji} {h.destName ? `· ${h.destName}` : `${h.participantCount} going`}
        </div>
      </div>
      {!onChanged && <ChevronRight className="h-5 w-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />}
    </Link>
    {onChanged && <HangoutActions h={h} onDone={onChanged} />}
    </div>
  );
}
