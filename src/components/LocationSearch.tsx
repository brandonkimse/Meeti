"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api } from "@/lib/client/api";
import type { LatLng, PlaceCandidate } from "@/lib/types";
import { Spinner } from "./ui";

/** Debounced place & address autocomplete backed by /api/geo/search. */
export function LocationSearch({
  near,
  placeholder = "Search a place or address",
  onPick,
  autoFocus = false,
  actionLabel,
}: {
  near?: LatLng | null;
  placeholder?: string;
  onPick: (p: PlaceCandidate) => void | Promise<void>;
  autoFocus?: boolean;
  actionLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const seq = useRef(0);
  const nlat = near?.lat;
  const nlng = near?.lng;

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ q: query });
        if (nlat != null && nlng != null) {
          qs.set("lat", String(nlat));
          qs.set("lng", String(nlng));
        }
        const r = await api<{ results: PlaceCandidate[] }>(`/api/geo/search?${qs}`);
        if (n === seq.current) {
          setResults(r.results);
          setError(null);
        }
      } catch (e) {
        if (n === seq.current) setError((e as Error).message);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, nlat, nlng]);

  const shown = q.trim().length >= 2 ? results : [];

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-faint" />
        <input className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
        {loading && q.trim().length >= 2 && <Spinner className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {shown.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-2xl bg-white shadow-card">
          {shown.map((r) => (
            <li key={r.externalId} className="border-b border-line/60 last:border-0">
              <button
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-soft disabled:opacity-60"
                disabled={!!picking}
                onClick={async () => {
                  setPicking(r.externalId);
                  try {
                    await onPick(r);
                    setQ("");
                    setResults([]);
                  } finally {
                    setPicking(null);
                  }
                }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft">
                  {picking === r.externalId ? <Spinner className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[r.kind, r.address].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {actionLabel && <span className="text-xs font-bold text-muted">{actionLabel}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
