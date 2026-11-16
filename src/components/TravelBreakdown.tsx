"use client";

import { minutes, shortMin } from "@/lib/client/format";
import { palette } from "@/lib/client/colors";
import { MODES, type Participant, type TravelSummary } from "@/lib/types";
import { Avatar } from "./ui";

export function fairnessLabel(f: number | null) {
  if (f == null) return { text: "–", tone: "text-muted" };
  const pct = Math.round(f * 100);
  return { text: `${pct}%`, tone: pct >= 92 ? "text-mint" : pct >= 80 ? "text-ink" : "text-coral" };
}

export function TravelStats({ t }: { t: TravelSummary }) {
  const f = fairnessLabel(t.counted > 1 ? t.fairness : null);
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-soft px-2 py-2">
        <div className="font-display text-lg font-extrabold leading-none">{shortMin(t.avg)}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">Avg trip</div>
      </div>
      <div className="rounded-xl bg-soft px-2 py-2">
        <div className="font-display text-lg font-extrabold leading-none">{shortMin(t.max)}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">Longest</div>
      </div>
      <div className="rounded-xl bg-soft px-2 py-2">
        <div className={`font-display text-lg font-extrabold leading-none ${f.tone}`}>{f.text}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">Fairness</div>
      </div>
    </div>
  );
}

/** Per-person travel bars: the visual answer to "is this fair to me?". */
export function TravelBars({ t, participants, meId }: { t: TravelSummary; participants: Participant[]; meId: string }) {
  const max = Math.max(1, ...t.perMember.map((m) => m.seconds ?? 0));
  const rows = [...t.perMember].sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0));
  return (
    <div className="space-y-1.5">
      {rows.map((m) => {
        const p = participants.find((x) => x.user.id === m.userId);
        if (!p) return null;
        const mode = MODES.find((x) => x.id === m.mode);
        const [c1] = palette(p.user.id);
        return (
          <div key={m.userId} className="flex items-center gap-2 text-sm">
            <Avatar user={p.user} size={22} />
            <span className="w-16 truncate text-xs font-semibold">{p.user.id === meId ? "You" : p.user.name.split(" ")[0]}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((m.seconds ?? 0) / max) * 100}%`, background: c1 }} />
            </div>
            <span className="w-16 text-right text-xs font-bold tabular-nums">
              <span className="mr-1" title={mode?.label}>
                {mode?.emoji}
              </span>
              {m.seconds == null ? "n/a" : minutes(m.seconds)}
              {m.source === "model" && <span title="Estimated" className="text-faint">*</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TravelChips({ t, participants }: { t: TravelSummary; participants: Participant[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {t.perMember.map((m) => {
        const p = participants.find((x) => x.user.id === m.userId);
        if (!p) return null;
        return (
          <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-soft py-0.5 pl-0.5 pr-2 text-xs font-bold tabular-nums">
            <Avatar user={p.user} size={18} />
            {shortMin(m.seconds)}
          </span>
        );
      })}
    </div>
  );
}
