"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Crosshair, Info, Keyboard, Lock, Sparkles, Star, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/useNow";
import { palette } from "@/lib/client/colors";
import { firstName, shortMin } from "@/lib/client/format";
import { CATEGORIES, MODES, type Category, type HangoutDetail, type LatLng, type PlaceCandidate, type Recommendation, type Suggestion } from "@/lib/types";
import { LocationSearch } from "../LocationSearch";
import { MapView, avatarPinHtml, numberPinHtml, type MapLine, type MapMarker } from "../MapView";
import { PlaceCover } from "../PlaceCover";
import { TravelBars, TravelChips, TravelStats } from "../TravelBreakdown";
import { Avatar, AvatarStack, Segmented, Sheet, Spinner, useToast } from "../ui";
import { HangoutHeader, modeOf, Stepper, type Mutate, type StepId } from "./shared";

type Tab = Exclude<StepId, "live">;

const sameplace = (a: { name: string; lat: number; lng: number }, b: { name: string; lat: number; lng: number }) =>
  a.name === b.name && Math.abs(a.lat - b.lat) < 0.0003 && Math.abs(a.lng - b.lng) < 0.0003;

export function PlanningView({ h, mutate }: { h: HangoutDetail; mutate: Mutate }) {
  const toast = useToast();
  const meId = h.me.id;
  const me = h.participants.find((p) => p.user.id === meId);
  const going = h.participants.filter((p) => p.rsvp !== "declined");
  const withOrigin = going.filter((p) => p.origin);

  const initialTab: Tab = !me?.origin ? "start" : h.suggestions.length ? "vote" : "places";
  const [tab, setTab] = useState<Tab>(initialTab);
  const panel = useRef<HTMLDivElement>(null);
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    // Bring the new step into view on both the mobile page and the desktop side panel.
    panel.current?.scrollTo({ top: 0, behavior: "smooth" });
    if (window.innerWidth < 1024) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab]);
  const [active, setActive] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>(h.recommendations?.category ?? h.category ?? "food");
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const recs = h.recommendations?.category === category ? h.recommendations : null;
  const center: LatLng | null = h.recommendations?.center ?? (withOrigin[0]?.origin ? { lat: withOrigin[0].origin.lat, lng: withOrigin[0].origin.lng } : null);

  // ----- Map -----
  const { markers, lines, fitPoints, fitKey } = useMemo(() => {
    const markers: MapMarker[] = [];
    const lines: MapLine[] = [];
    for (const p of going) {
      if (!p.origin) continue;
      markers.push({
        id: `o:${p.user.id}`,
        lat: p.origin.lat,
        lng: p.origin.lng,
        size: [44, 52],
        anchor: [22, 52],
        z: 500,
        title: p.user.name,
        html: avatarPinHtml({ name: p.user.name, avatarUrl: p.user.avatarUrl, bg: `linear-gradient(135deg, ${palette(p.user.id).join(",")})`, badge: modeOf(p.mode).emoji }),
      });
    }
    h.suggestions.forEach((s, i) => {
      markers.push({
        id: `s:${s.id}`,
        lat: s.lat,
        lng: s.lng,
        size: [34, 34],
        z: active === s.id ? 1000 : 600,
        title: s.name,
        html: numberPinHtml(i + 1, { active: active === s.id }),
        onClick: () => {
          setActive(s.id);
          setTab("vote");
        },
      });
    });
    if (tab === "places" && recs) {
      recs.items.forEach((r, i) => {
        if (h.suggestions.some((s) => sameplace(s, r))) return;
        markers.push({
          id: `r:${r.externalId}`,
          lat: r.lat,
          lng: r.lng,
          size: [34, 34],
          z: active === r.externalId ? 1000 : 550,
          title: r.name,
          html: numberPinHtml(String.fromCharCode(65 + i), { rec: true, active: active === r.externalId }),
          onClick: () => setActive(r.externalId),
        });
      });
    }
    const target = h.suggestions.find((s) => s.id === active) ?? recs?.items.find((r) => r.externalId === active);
    if (target)
      for (const p of going)
        if (p.origin)
          lines.push({ id: `l:${p.user.id}`, points: [p.origin, target], color: palette(p.user.id)[0], dashed: true, weight: 3, opacity: 0.9 });

    const fitPoints: LatLng[] = [
      ...going.filter((p) => p.origin).map((p) => p.origin!),
      ...h.suggestions,
      ...(tab === "places" && recs ? recs.items : []),
    ];
    const fitKey = fitPoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|") + tab;
    return { markers, lines, fitPoints, fitKey };
  }, [going, h.suggestions, recs, tab, active]);

  const totalVotes = h.suggestions.reduce((s, x) => s + x.votes.length, 0);

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_480px]">
      <div className="relative h-[40dvh] min-h-[260px] lg:h-full">
        <MapView markers={markers} lines={lines} fitPoints={fitPoints} fitKey={fitKey} padding={[56, 56]} />
        <Link href={`/groups/${h.group.id}`} className="btn btn-outline absolute left-3 top-3 z-[500] p-2.5 shadow-card lg:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {!fitPoints.length && (
          <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center">
            <div className="rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-semibold shadow-card">Add starting points to see everyone on the map</div>
          </div>
        )}
      </div>

      <div ref={panel} className="relative -mt-6 scroll-mt-0 rounded-t-3xl bg-paper px-4 pb-28 pt-5 sm:px-6 lg:mt-0 lg:overflow-y-auto lg:rounded-none lg:pb-10">
        <div className="hidden lg:block">
          <HangoutHeader h={h} />
        </div>
        <div className="lg:hidden">
          <h1 className="font-display text-2xl font-extrabold leading-tight">{h.title}</h1>
          <p className="text-sm font-semibold text-muted">
            {h.group.emoji} {h.group.name} · {new Date(h.startsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="mt-4">
          <Stepper active={tab} onPick={(s) => s !== "live" && setTab(s)} done={{ start: !!me?.origin, places: h.suggestions.length > 0, vote: !!h.suggestions.find((s) => s.votes.includes(meId)) }} />
        </div>

        <div className="mt-5">
          {tab === "start" && <StartTab h={h} mutate={mutate} onNext={() => setTab(h.suggestions.length ? "vote" : "places")} />}
          {tab === "places" && (
            <PlacesTab h={h} mutate={mutate} category={category} setCategory={setCategory} recs={recs} center={center} active={active} setActive={setActive} onAdded={() => toast("Added to the vote ✓")} goVote={() => setTab("vote")} />
          )}
          {tab === "vote" && (
            <VoteTab h={h} mutate={mutate} active={active} setActive={setActive} totalVotes={totalVotes} goPlaces={() => setTab("places")} openFinalize={() => setFinalizeOpen(true)} />
          )}
        </div>
      </div>

      <FinalizeSheet h={h} open={finalizeOpen} onClose={() => setFinalizeOpen(false)} mutate={mutate} />
    </div>
  );
}

/* ================= Start points ================= */

function StartTab({ h, mutate, onNext }: { h: HangoutDetail; mutate: Mutate; onNext: () => void }) {
  const toast = useToast();
  const meId = h.me.id;
  const me = h.participants.find((p) => p.user.id === meId)!;
  const [typing, setTyping] = useState(false);
  const [locating, setLocating] = useState(false);
  const others = h.participants.length - 1;

  async function saveOrigin(body: { lat: number; lng: number; source: "gps" | "manual"; label?: string | null }) {
    await api(`/api/hangouts/${h.id}/origin`, { method: "PUT", body });
    setTyping(false);
    await mutate();
  }

  function useGps() {
    if (!navigator.geolocation) return toast("Your browser doesn't support location.", "error");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await saveOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" });
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast(err.code === err.PERMISSION_DENIED ? "Location permission denied. Type an address instead." : "Couldn't get your location. Try typing an address.", "error");
        if (err.code === err.PERMISSION_DENIED) setTyping(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  const near = h.participants.find((p) => p.origin)?.origin ?? null;

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <Avatar user={me.user} size={40} />
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold">Where are you coming from?</div>
            {me.origin ? (
              <div className="truncate text-sm text-muted">
                {me.origin.source === "gps" ? "📍" : "⌨️"} {me.origin.label ?? "Pinned location"}
              </div>
            ) : (
              <div className="text-sm text-muted">We use this to find a fair spot. It&apos;s only used for this hangout.</div>
            )}
          </div>
          {me.origin && !typing && (
            <button className="btn btn-soft btn-sm" onClick={() => setTyping(true)}>
              Change
            </button>
          )}
        </div>

        {(!me.origin || typing) && (
          <div className="mt-4 space-y-3">
            {!typing ? (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ink" onClick={useGps} disabled={locating}>
                  {locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />} Use my location
                </button>
                <button className="btn btn-outline" onClick={() => setTyping(true)}>
                  <Keyboard className="h-4 w-4" /> Type an address
                </button>
              </div>
            ) : (
              <>
                <LocationSearch
                  autoFocus
                  near={near}
                  placeholder="Address, landmark or intersection"
                  onPick={(p) => saveOrigin({ lat: p.lat, lng: p.lng, source: "manual", label: [p.name, p.address?.split(",")[1]?.trim()].filter(Boolean).join(", ") })}
                />
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setTyping(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={useGps} disabled={locating}>
                    <Crosshair className="h-3.5 w-3.5" /> Use GPS instead
                  </button>
                </div>
              </>
            )}
            <p className="flex gap-1.5 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your starting point is visible to the {others} other {others === 1 ? "person" : "people"} in this hangout. If you&apos;d rather not share your exact spot, type a nearby landmark.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
          <div>
            <div className="label">How you&apos;re getting there</div>
            <Segmented
              size="sm"
              value={me.mode}
              onChange={async (mode) => {
                await api(`/api/hangouts/${h.id}/participation`, { method: "PATCH", body: { mode } });
                mutate();
              }}
              options={MODES.map((m) => ({ id: m.id, label: <>{m.emoji} {m.label}</> }))}
            />
          </div>
          <div>
            <div className="label">Are you in?</div>
            <Segmented
              size="sm"
              value={me.rsvp}
              onChange={async (rsvp) => {
                await api(`/api/hangouts/${h.id}/participation`, { method: "PATCH", body: { rsvp } });
                mutate();
              }}
              options={[
                { id: "going", label: "🙌 Going" },
                { id: "maybe", label: "🤔 Maybe" },
                { id: "declined", label: "😢 Can't" },
              ]}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-display mb-2 font-bold">
          Who&apos;s in · {h.participants.filter((p) => p.origin && p.rsvp !== "declined").length}/{h.participants.filter((p) => p.rsvp !== "declined").length} ready
        </h3>
        <div className="card divide-y divide-line/70">
          {h.participants.map((p) => (
            <div key={p.user.id} className={`flex items-center gap-3 p-3 ${p.rsvp === "declined" ? "opacity-50" : ""}`}>
              <Avatar user={p.user} size={36} showOnline />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.user.id === meId ? "You" : p.user.name}</div>
                <div className="truncate text-xs text-muted">
                  {p.rsvp === "declined" ? "Can't make it" : p.origin ? p.origin.label ?? "Starting point set" : "Hasn't added a starting point"}
                </div>
              </div>
              <span className="text-lg" title={modeOf(p.mode).label}>
                {modeOf(p.mode).emoji}
              </span>
              {p.origin && p.rsvp !== "declined" ? (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-volt">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              ) : (
                <span className="h-6 w-6 rounded-full border-2 border-dashed border-line" />
              )}
            </div>
          ))}
        </div>
      </section>

      <button className="btn btn-ink btn-lg w-full" onClick={onNext} disabled={!me.origin && me.rsvp !== "declined"}>
        Next: find places <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ================= Places ================= */

function PlacesTab({
  h,
  mutate,
  category,
  setCategory,
  recs,
  center,
  active,
  setActive,
  onAdded,
  goVote,
}: {
  h: HangoutDetail;
  mutate: Mutate;
  category: Category;
  setCategory: (c: Category) => void;
  recs: HangoutDetail["recommendations"];
  center: LatLng | null;
  active: string | null;
  setActive: (id: string | null) => void;
  onAdded: () => void;
  goVote: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const origins = h.participants.filter((p) => p.origin && p.rsvp !== "declined").length;

  async function find(c = category) {
    setLoading(true);
    try {
      await api(`/api/hangouts/${h.id}/recommendations`, { body: { category: c } });
      await mutate();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function add(p: PlaceCandidate, source: "member" | "meeti") {
    setAdding(p.externalId);
    try {
      await api(`/api/hangouts/${h.id}/suggestions`, { body: { ...p, source } });
      await mutate();
      onAdded();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="font-display text-xl font-extrabold">Fair picks</h3>
            <p className="text-sm text-muted">Places that balance everyone&apos;s actual travel time.</p>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className="chip"
              data-active={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setActive(null);
              }}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {!recs || h.recommendationsStale ? (
          <div className="card mt-3 p-5 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-volt">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="font-display mt-3 font-bold">
              {recs && h.recommendationsStale ? "Someone's starting point changed" : `Find the fairest ${CATEGORIES.find((c) => c.id === category)!.label.toLowerCase()}`}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              {origins === 0
                ? "Add at least one starting point first."
                : `Meeti checks real travel times from all ${origins} starting ${origins === 1 ? "point" : "points"}, then suggests places that nobody has to trek to.`}
            </p>
            <button className="btn btn-volt mt-4" onClick={() => find()} disabled={loading || origins === 0}>
              {loading ? (
                <>
                  <Spinner className="h-4 w-4" /> Crunching travel times…
                </>
              ) : recs ? (
                "Refresh picks"
              ) : (
                "Find fair spots"
              )}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {recs.notes.map((n) => (
              <p key={n} className="flex gap-1.5 rounded-xl bg-white px-3 py-2 text-xs text-muted shadow-card">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
              </p>
            ))}
            {recs.items.map((r, i) => (
              <RecCard
                key={r.externalId}
                r={r}
                letter={String.fromCharCode(65 + i)}
                h={h}
                active={active === r.externalId}
                onFocus={() => setActive(active === r.externalId ? null : r.externalId)}
                added={h.suggestions.some((s) => sameplace(s, r))}
                adding={adding === r.externalId}
                onAdd={() => add(r, "meeti")}
              />
            ))}
            <button className="btn btn-ghost btn-sm w-full text-muted" onClick={() => find()} disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : "↻ Recalculate"}
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-display mb-1 font-bold">Have somewhere in mind?</h3>
        <p className="mb-3 text-sm text-muted">Search for any place and add it to the vote. Meeti works out everyone&apos;s travel time for it.</p>
        <LocationSearch near={center} placeholder="Search restaurants, parks, addresses…" actionLabel="+ Add" onPick={(p) => add({ ...p, category: p.category ?? null }, "member")} />
      </section>

      {h.suggestions.length > 0 && (
        <button className="btn btn-ink btn-lg w-full" onClick={goVote}>
          Go vote · {h.suggestions.length} {h.suggestions.length === 1 ? "option" : "options"} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function RecCard({
  r,
  letter,
  h,
  active,
  onFocus,
  added,
  adding,
  onAdd,
}: {
  r: Recommendation;
  letter: string;
  h: HangoutDetail;
  active: boolean;
  onFocus: () => void;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className={`card overflow-hidden transition ${active ? "ring-2 ring-ink" : ""}`}>
      <button className="flex w-full gap-3 p-3 text-left" onClick={onFocus}>
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
          <PlaceCover imageUrl={r.imageUrl} category={r.category} seed={r.externalId} compact label={r.name} />
          <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-white text-xs font-extrabold shadow">{letter}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-[17px] font-bold">{r.name}</div>
          <div className="truncate text-xs text-muted">{[r.kind, r.address].filter(Boolean).join(" · ")}</div>
          {r.rating != null && (
            <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold">
              <Star className="h-3 w-3 fill-amber text-amber" /> {r.rating.toFixed(1)}
              {r.ratingCount ? <span className="text-muted">({r.ratingCount})</span> : null}
            </div>
          )}
          {r.reason && <div className="mt-1.5 inline-block rounded-full bg-volt/60 px-2 py-0.5 text-[11px] font-bold text-volt-ink">{r.reason}</div>}
        </div>
      </button>
      <div className="space-y-3 px-3 pb-3">
        <TravelStats t={r.travel} />
        {active ? <TravelBars t={r.travel} participants={h.participants} meId={h.me.id} /> : <TravelChips t={r.travel} participants={h.participants} />}
        <button className={`btn w-full ${added ? "btn-soft" : "btn-ink"}`} disabled={added || adding} onClick={onAdd}>
          {adding ? <Spinner className="h-4 w-4" /> : added ? <><Check className="h-4 w-4" /> In the vote</> : "+ Add to vote"}
        </button>
      </div>
    </div>
  );
}

/* ================= Vote ================= */

function badgesFor(list: Suggestion[]) {
  const withVotes = list.filter((s) => s.votes.length > 0);
  const maxVotes = Math.max(0, ...withVotes.map((s) => s.votes.length));
  const popular = withVotes.filter((s) => s.votes.length === maxVotes);
  const fairCands = list.filter((s) => s.travel && s.travel.counted > 1 && s.travel.fairness != null);
  const fairest = fairCands.sort((a, b) => b.travel!.fairness! - a.travel!.fairness! || a.travel!.max! - b.travel!.max!)[0];
  return { popular: popular.length === 1 ? popular[0].id : null, fairest: fairest?.id ?? null };
}

function VoteTab({
  h,
  mutate,
  active,
  setActive,
  totalVotes,
  goPlaces,
  openFinalize,
}: {
  h: HangoutDetail;
  mutate: Mutate;
  active: string | null;
  setActive: (id: string | null) => void;
  totalVotes: number;
  goPlaces: () => void;
  openFinalize: () => void;
}) {
  const toast = useToast();
  const meId = h.me.id;
  const myVote = h.suggestions.find((s) => s.votes.includes(meId))?.id ?? null;
  const voters = h.participants.filter((p) => h.suggestions.some((s) => s.votes.includes(p.user.id)));
  const eligible = h.participants.filter((p) => p.rsvp !== "declined");
  const { popular, fairest } = badgesFor(h.suggestions);
  const now = useNow(30000);
  const closed = !!h.pollClosesAt && now > h.pollClosesAt;
  const host = h.participants.find((p) => p.user.id === h.createdBy)?.user;

  async function vote(id: string | null) {
    // Optimistic update for snappy voting.
    mutate(
      (cur) =>
        cur && {
          ...cur,
          suggestions: cur.suggestions.map((s) => ({
            ...s,
            votes: s.id === id ? [...s.votes.filter((v) => v !== meId), meId] : s.votes.filter((v) => v !== meId),
          })),
        },
      { revalidate: false },
    );
    try {
      await api(`/api/hangouts/${h.id}/vote`, { method: "PUT", body: { suggestionId: id } });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    mutate();
  }

  if (!h.suggestions.length)
    return (
      <div className="card p-6 text-center">
        <div className="text-4xl">🗳️</div>
        <p className="font-display mt-2 text-lg font-bold">No options yet</p>
        <p className="text-sm text-muted">Add a fair pick or search for a place. Then everyone votes.</p>
        <button className="btn btn-volt mt-4" onClick={goPlaces}>
          Find places
        </button>
      </div>
    );

  const ordered = h.suggestions.map((s, i) => ({ s, n: i + 1 })).sort((a, b) => b.s.votes.length - a.s.votes.length || (b.s.travel?.fairness ?? 0) - (a.s.travel?.fairness ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-extrabold">Vote</h3>
          <p className="text-sm text-muted">
            {voters.length} of {eligible.length} voted{closed ? " · voting closed" : " · you can change your vote anytime"}
          </p>
        </div>
        <AvatarStack users={voters.map((v) => v.user)} size={28} />
      </div>

      {ordered.map(({ s, n }) => (
        <SuggestionCard
          key={s.id}
          s={s}
          n={n}
          h={h}
          mine={myVote === s.id}
          popular={popular === s.id}
          fairest={fairest === s.id}
          totalVotes={totalVotes}
          active={active === s.id}
          onFocus={() => setActive(active === s.id ? null : s.id)}
          onVote={() => vote(myVote === s.id ? null : s.id)}
          disabled={closed}
          onRemove={
            s.addedBy === meId || h.canManage
              ? async () => {
                  await api(`/api/hangouts/${h.id}/suggestions/${s.id}`, { method: "DELETE" });
                  mutate();
                }
              : undefined
          }
        />
      ))}

      <button className="btn btn-soft w-full" onClick={goPlaces}>
        + Add another option
      </button>

      {h.canManage ? (
        <div className="card mt-2 bg-ink p-4 text-white">
          <div className="font-display font-bold">Ready to decide?</div>
          <p className="text-sm text-white/70">Locking in the spot ends the vote and opens the live map for everyone.</p>
          <button className="btn btn-volt mt-3 w-full" onClick={openFinalize}>
            <Lock className="h-4 w-4" /> Lock in destination
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">{host ? `${firstName(host.name)} will` : "The host will"} lock in the final spot.</p>
      )}
    </div>
  );
}

function SuggestionCard({
  s,
  n,
  h,
  mine,
  popular,
  fairest,
  totalVotes,
  active,
  onFocus,
  onVote,
  onRemove,
  disabled,
}: {
  s: Suggestion;
  n: number;
  h: HangoutDetail;
  mine: boolean;
  popular: boolean;
  fairest: boolean;
  totalVotes: number;
  active: boolean;
  onFocus: () => void;
  onVote: () => void;
  onRemove?: () => void;
  disabled: boolean;
}) {
  const voters = h.participants.filter((p) => s.votes.includes(p.user.id));
  const adder = h.participants.find((p) => p.user.id === s.addedBy);
  const pct = totalVotes ? Math.round((s.votes.length / totalVotes) * 100) : 0;
  return (
    <div className={`card animate-rise overflow-hidden transition ${mine ? "ring-2 ring-ink" : active ? "ring-2 ring-faint" : ""}`}>
      <div className="relative h-28 cursor-pointer" onClick={onFocus}>
        <PlaceCover imageUrl={s.imageUrl} category={s.category} seed={s.id} label={s.name} />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-lg bg-white text-sm font-extrabold shadow">{n}</span>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          {popular && <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white shadow">🔥 Most popular</span>}
          {fairest && <span className="rounded-full bg-volt px-2 py-0.5 text-[11px] font-bold text-ink shadow">⚖️ Fairest trip</span>}
        </div>
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between text-white">
          <div className="min-w-0">
            <div className="font-display truncate text-lg font-bold drop-shadow">{s.name}</div>
          </div>
          {s.rating != null && (
            <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-xs font-bold backdrop-blur">
              <Star className="h-3 w-3 fill-amber text-amber" /> {s.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="min-w-0 flex-1 truncate">{s.address ?? "Address unavailable"}</span>
          {s.source === "meeti" ? (
            <span className="shrink-0 font-semibold">✨ Meeti pick</span>
          ) : adder ? (
            <span className="flex shrink-0 items-center gap-1 font-semibold">
              <Avatar user={adder.user} size={16} /> {adder.user.id === h.me.id ? "You" : firstName(adder.user.name)}
            </span>
          ) : null}
          {onRemove && (
            <button className="shrink-0 rounded-full p-1 hover:bg-soft" onClick={onRemove} aria-label="Remove option" title="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {s.travel ? (
          <>
            <TravelStats t={s.travel} />
            <button className="flex w-full items-center justify-between text-xs font-bold text-muted" onClick={onFocus}>
              <span>{active ? "Everyone's trip" : <TravelChips t={s.travel} participants={h.participants} />}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition ${active ? "rotate-180" : ""}`} />
            </button>
            {active && <TravelBars t={s.travel} participants={h.participants} meId={h.me.id} />}
            {s.travelStale && <p className="text-[11px] text-faint">Updating for new starting points…</p>}
          </>
        ) : (
          <p className="text-xs text-muted">Travel times will appear once people add starting points.</p>
        )}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>
                {s.votes.length} {s.votes.length === 1 ? "vote" : "votes"}
              </span>
              <span className="text-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            {voters.length > 0 && (
              <div className="mt-1.5">
                <AvatarStack users={voters.map((v) => v.user)} size={20} max={6} />
              </div>
            )}
          </div>
          <button className={`btn shrink-0 ${mine ? "btn-ink" : "btn-volt"}`} onClick={onVote} disabled={disabled}>
            {mine ? (
              <>
                <Check className="h-4 w-4" /> Voted
              </>
            ) : (
              "Vote"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Finalize ================= */

function FinalizeSheet({ h, open, onClose, mutate }: { h: HangoutDetail; open: boolean; onClose: () => void; mutate: Mutate }) {
  const toast = useToast();
  const leading = [...h.suggestions].sort((a, b) => b.votes.length - a.votes.length || (b.travel?.fairness ?? 0) - (a.travel?.fairness ?? 0))[0];
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = pick ?? leading?.id ?? null;
  const { fairest } = badgesFor(h.suggestions);

  return (
    <Sheet open={open} onClose={onClose} title="Lock in the destination">
      <div className="space-y-2">
        {h.suggestions.map((s) => (
          <button
            key={s.id}
            onClick={() => setPick(s.id)}
            className={`flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card transition ${chosen === s.id ? "ring-2 ring-ink" : ""}`}
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
              <PlaceCover imageUrl={s.imageUrl} category={s.category} seed={s.id} compact />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{s.name}</div>
              <div className="text-xs text-muted">
                {s.votes.length} {s.votes.length === 1 ? "vote" : "votes"} · avg {shortMin(s.travel?.avg)} · max {shortMin(s.travel?.max)}
                {fairest === s.id ? " · ⚖️ fairest" : ""}
              </div>
            </div>
            <span className={`grid h-6 w-6 place-items-center rounded-full ${chosen === s.id ? "bg-ink text-white" : "border-2 border-line"}`}>
              {chosen === s.id && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-volt btn-lg mt-4 w-full"
        disabled={!chosen || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/hangouts/${h.id}/finalize`, { body: { suggestionId: chosen } });
            onClose();
            await mutate();
          } catch (e) {
            toast((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <>📍 Lock it in &amp; go live</>}
      </button>
      <button className="btn btn-ghost mt-1 w-full text-muted" onClick={onClose}>
        <X className="h-4 w-4" /> Keep voting
      </button>
      <p className="mt-2 text-center text-xs text-muted">Everyone gets notified, and the live map opens. Location sharing stays off until each person turns it on.</p>
    </Sheet>
  );
}

