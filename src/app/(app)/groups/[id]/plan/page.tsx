"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useNow } from "@/lib/client/useNow";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { GroupTile, PageLoader, Spinner } from "@/components/ui";
import { api, fetcher } from "@/lib/client/api";
import { CATEGORIES, MODES, type Category, type GroupDetail, type Mode } from "@/lib/types";

const PRESETS: { title: string; category: Category }[] = [
  { title: "Dinner", category: "food" },
  { title: "Coffee catch-up", category: "cafe" },
  { title: "Study session", category: "cafe" },
  { title: "Drinks", category: "drinks" },
  { title: "Something fun", category: "activity" },
  { title: "Picnic", category: "park" },
];

function dayOptions() {
  const out: { label: string; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({ label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric" }), date: d });
  }
  return out;
}

function defaultTime() {
  const h = new Date().getHours();
  const t = h < 17 ? 19 : Math.min(23, h + 1);
  return `${String(t).padStart(2, "0")}:00`;
}

export default function PlanHangout() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: g } = useSWR<GroupDetail>(`/api/groups/${id}`, fetcher);
  const [days] = useState(dayOptions);
  const now = useNow(30000);
  const [title, setTitle] = useState("Dinner");
  const [category, setCategory] = useState<Category | null>("food");
  const [day, setDay] = useState(0);
  const [time, setTime] = useState(defaultTime);
  const [mode, setMode] = useState<Mode>("transit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!g) return <PageLoader />;

  const startsAt = (() => {
    const d = new Date(days[day].date);
    const [hh, mm] = time.split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  })();
  const inPast = startsAt < now - 15 * 60_000;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { id: hid } = await api<{ id: string }>(`/api/groups/${id}/hangouts`, { body: { title, startsAt, mode, category } });
      router.push(`/hangouts/${hid}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/groups/${id}`} className="btn btn-ghost btn-sm -ml-3 mb-2">
        <ArrowLeft className="h-4 w-4" /> {g.name}
      </Link>
      <div className="flex items-center gap-3">
        <GroupTile group={g} size={44} />
        <h1 className="font-display text-3xl font-extrabold">New hangout</h1>
      </div>

      <div className="mt-6 space-y-6">
        <section>
          <label className="label">What&apos;s the plan?</label>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {PRESETS.map((p) => (
              <button
                key={p.title}
                className="chip"
                data-active={title === p.title}
                onClick={() => {
                  setTitle(p.title);
                  setCategory(p.category);
                }}
              >
                {CATEGORIES.find((c) => c.id === p.category)?.emoji} {p.title}
              </button>
            ))}
          </div>
          <input className="input mt-3" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Name your hangout" />
        </section>

        <section>
          <label className="label">When?</label>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d, i) => (
              <button key={i} className="chip" data-active={day === i} onClick={() => setDay(i)}>
                {d.label}
              </button>
            ))}
          </div>
          <input type="time" className="input mt-3" value={time} onChange={(e) => setTime(e.target.value)} />
          {inPast && <p className="mt-2 text-sm font-semibold text-danger">That time has already passed.</p>}
        </section>

        <section>
          <label className="label">How is everyone getting there?</label>
          <div className="grid grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-semibold transition ${mode === m.id ? "bg-ink text-white" : "bg-white shadow-card hover:-translate-y-0.5"}`}
              >
                <span className="text-2xl">{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">This is the default. Anyone can change how they&apos;re getting there.</p>
        </section>

        <section>
          <label className="label">
            What kind of place? <span className="font-normal text-faint">(you can change this later)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.id} className="chip" data-active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <button className="btn btn-volt btn-lg w-full" disabled={busy || !title.trim() || inPast} onClick={create}>
          {busy ? <Spinner /> : `Create & invite ${g.memberCount - 1 > 0 ? `${g.memberCount - 1} ${g.memberCount - 1 === 1 ? "friend" : "friends"}` : "the group"}`}
        </button>
      </div>
    </div>
  );
}
