"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Maximize2, Navigation, Pause, Play, ShieldCheck, Square } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/useNow";
import { palette } from "@/lib/client/colors";
import { ago, clock, clockWithDay, distance, minutes } from "@/lib/client/format";
import type { HangoutDetail, LatLng, LiveShare } from "@/lib/types";
import { MapView, avatarPinHtml, destPinHtml, type MapLine, type MapMarker } from "../MapView";
import { PlaceCover } from "../PlaceCover";
import { Avatar, AvatarStack, Sheet, Spinner, useToast } from "../ui";
import { backLink, categoryEmoji, modeOf, STATE_UI, travelState, type Mutate } from "./shared";

type GpsState = { status: "idle" | "waiting" | "ok" | "denied" | "error"; accuracy?: number };

/** Streams this device's position while the user's share is active. */
function useLocationSender(hangoutId: string, enabled: boolean, onExpired: () => void): GpsState {
  const [gps, setGps] = useState<GpsState>({ status: "waiting" });
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const last = useRef<{ t: number; p: LatLng } | null>(null);
  const expired = useRef(onExpired);
  useEffect(() => {
    expired.current = onExpired;
  });

  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGps({ status: "ok", accuracy: pos.coords.accuracy });
        const now = Date.now();
        const l = last.current;
        const moved = l ? Math.hypot((p.lat - l.p.lat) * 111000, (p.lng - l.p.lng) * 88000) : Infinity;
        // Throttle: at most every 4s, or immediately after moving 30m.
        if (l && now - l.t < 4000 && moved < 30) return;
        if (l && now - l.t < 1500) return;
        last.current = { t: now, p };
        api(`/api/hangouts/${hangoutId}/location`, { body: { ...p, accuracy: pos.coords.accuracy } }).catch((e) => {
          if (e.status === 410 || e.status === 403 || e.status === 409) expired.current();
        });
      },
      (err) => setGps({ status: err.code === err.PERMISSION_DENIED ? "denied" : "error" }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      setGps({ status: "waiting" });
    };
  }, [enabled, hangoutId, supported]);

  if (!enabled) return { status: "idle" };
  if (!supported) return { status: "error" };
  return gps;
}

export function LiveView({ h, mutate, trails }: { h: HangoutDetail; mutate: Mutate; trails: Record<string, LatLng[]> }) {
  const toast = useToast();
  const meId = h.me.id;
  const dest = h.destination!;
  const myShare = h.me.share;
  const myState = travelState(myShare);
  const back = backLink(h);
  const [simulating, setSimulating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [expanded, setExpanded] = useState(true);

  const sharingActive = myShare?.status === "active" && !myShare.arrivedAt;

  // Demo mode: this screen drives the simulated friends' journeys.
  useEffect(() => {
    if (!h.providers.demoMode) return;
    const tick = () => api(`/api/hangouts/${h.id}/demo-tick`, { body: {} }).catch(() => {});
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [h.id, h.providers.demoMode]);
  const gps = useLocationSender(h.id, sharingActive && !simulating, () => mutate());

  const viewers = h.participants.filter((p) => p.rsvp !== "declined" && p.user.id !== meId);


  const people = useMemo(
    () =>
      h.participants
        .filter((p) => p.rsvp !== "declined")
        .map((p) => {
          const share = h.shares.find((s) => s.userId === p.user.id) ?? null;
          return { p, share, state: travelState(share) };
        }),
    [h.participants, h.shares],
  );
  const arrived = people.filter((x) => x.state === "arrived");
  const travelling = people.filter((x) => x.state !== "arrived");
  const etas = travelling.map((x) => x.share?.etaSeconds).filter((e): e is number => e != null);
  const now = useNow(10000);
  const everyoneBy = travelling.length && etas.length === travelling.length ? now + Math.max(...etas) * 1000 : null;

  const { markers, lines, fitPoints } = useMemo(() => {
    const markers: MapMarker[] = [
      { id: "dest", lat: dest.lat, lng: dest.lng, size: [56, 56], z: 900, title: dest.name, html: destPinHtml(categoryEmoji(h.category)) },
    ];
    const lines: MapLine[] = [];
    const fitPoints: LatLng[] = [dest];
    for (const { p, share, state } of people) {
      if (!share || share.lat == null || share.lng == null || share.status !== "active") continue;
      const [c1, c2] = palette(p.user.id);
      const badge = state === "arrived" ? "✓ here" : share.etaSeconds != null ? minutes(share.etaSeconds) : null;
      markers.push({
        id: `u:${p.user.id}`,
        lat: share.lat,
        lng: share.lng,
        size: [44, 52],
        anchor: [22, 52],
        z: p.user.id === meId ? 800 : 700,
        moving: true,
        title: p.user.name,
        html: avatarPinHtml({ name: p.user.name, avatarUrl: p.user.avatarUrl, bg: `linear-gradient(135deg, ${c1}, ${c2})`, badge, pulse: p.user.id === meId, ring: p.user.id === meId ? "#d4ff3f" : undefined }),
      });
      fitPoints.push({ lat: share.lat, lng: share.lng });
      if (state !== "arrived") {
        lines.push({ id: `d:${p.user.id}`, points: [{ lat: share.lat, lng: share.lng }, dest], color: c1, dashed: true, weight: 2.5, opacity: 0.7 });
        const trail = trails[p.user.id];
        if (trail && trail.length > 1) lines.push({ id: `t:${p.user.id}`, points: trail, color: c1, weight: 4, opacity: 0.85 });
      }
    }
    return { markers, lines, fitPoints };
  }, [people, dest, meId, h.category, trails]);

  // Fit once when people first appear, then on demand.
  const fitKey = `${fitNonce}:${fitPoints.length}`;

  async function sharing(action: "start" | "pause" | "resume" | "stop") {
    setBusy(action);
    try {
      await api(`/api/hangouts/${h.id}/sharing`, { body: { action } });
      if (action !== "start") setSimulating(false);
      await mutate();
      if (action === "start") toast("Live location on. Your friends can see you coming.");
      if (action === "stop") toast("Stopped sharing. Your location has been removed.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative h-dvh overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="absolute inset-0 lg:relative">
        <MapView markers={markers} lines={lines} fitPoints={fitPoints} fitKey={fitKey} padding={[60, 90]} paddingBottom={0} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start gap-2 p-3">
          {back && (
            <Link href={back.href} className="btn btn-outline pointer-events-auto p-2.5 shadow-card" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl bg-white/95 px-3.5 py-2 shadow-card backdrop-blur lg:hidden">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0f8a5f]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> Live · {h.title}
            </div>
            <div className="font-display truncate font-bold">{dest.name}</div>
          </div>
        </div>
        <button className="btn btn-outline absolute right-3 top-[92px] z-[500] p-2.5 shadow-card lg:top-[96px]" onClick={() => setFitNonce((n) => n + 1)} aria-label="Fit everyone on map" title="Fit everyone">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom sheet on mobile, side panel on desktop */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[600] flex max-h-[78dvh] flex-col rounded-t-3xl bg-paper shadow-pop transition-transform duration-300 lg:relative lg:max-h-none lg:rounded-none lg:shadow-none ${
          expanded ? "" : "translate-y-[calc(100%-168px)] lg:translate-y-0"
        }`}
      >
        <button className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-line lg:hidden" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? "Collapse" : "Expand"} />
        <div className="overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          {/* Group ETA */}
          <div className="flex items-center gap-3" onClick={() => setExpanded(true)}>
            <div className="min-w-0 flex-1">
              <div className="hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0f8a5f] lg:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> Live · {h.title}
              </div>
              <div className="font-display text-2xl font-extrabold leading-tight">
                {travelling.length === 0 ? "Everyone's here! 🎉" : everyoneBy ? `Everyone there by ${clock(everyoneBy)}` : `${arrived.length} of ${people.length} arrived`}
              </div>
              <div className="text-sm text-muted">
                {arrived.length}/{people.length} arrived · {people.filter((x) => x.state === "on_the_way").length} on the way
              </div>
            </div>
            <div className="relative grid h-14 w-14 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e7e3da" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#17141f" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(arrived.length / Math.max(1, people.length)) * 97.4} 97.4`} className="transition-all duration-700" />
              </svg>
              <span className="font-display text-sm font-extrabold">
                {arrived.length}/{people.length}
              </span>
            </div>
          </div>

          {/* Destination */}
          <div className="card mt-4 flex items-center gap-3 p-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
              <PlaceCover imageUrl={dest.imageUrl} category={h.category} seed={dest.suggestionId ?? h.id} compact />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display truncate font-bold">{dest.name}</div>
              <div className="truncate text-xs text-muted">{dest.address ?? "Meeting spot"}</div>
            </div>
            <a
              className="btn btn-soft btn-sm"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=${{ walking: "walking", transit: "transit", cycling: "bicycling", driving: "driving" }[h.participants.find((p) => p.user.id === meId)?.mode ?? h.mode]}`}
            >
              <Navigation className="h-4 w-4" /> Directions
            </a>
          </div>

          {/* My sharing */}
          <MySharing
            h={h}
            share={myShare}
            state={myState}
            gps={gps}
            busy={busy}
            simulating={simulating}
            viewers={viewers.length}
            onStart={() => setConsentOpen(true)}
            onPause={() => sharing("pause")}
            onResume={() => sharing("resume")}
            onStop={() => sharing("stop")}
            onArrived={async () => {
              await api(`/api/hangouts/${h.id}/arrived`, { body: {} });
              setSimulating(false);
              mutate();
            }}
            onSimulate={async () => {
              try {
                setSimulating(true);
                await api(`/api/hangouts/${h.id}/simulate`, { body: {} });
              } catch (e) {
                setSimulating(false);
                toast((e as Error).message, "error");
              }
            }}
          />

          {/* Friends */}
          <h3 className="font-display mb-2 mt-5 font-bold">Friends</h3>
          <div className="card divide-y divide-line/70">
            {[...people]
              .sort((a, b) => rank(a.state) - rank(b.state) || (a.share?.etaSeconds ?? 1e9) - (b.share?.etaSeconds ?? 1e9))
              .map(({ p, share, state }) => (
                <FriendRow key={p.user.id} now={now} name={p.user.id === meId ? "You" : p.user.name} user={p.user} share={share} state={state} mode={modeOf(p.mode).emoji} />
              ))}
          </div>

          <div className="mt-5">
            <button className={`btn w-full ${travelling.length === 0 ? "btn-volt btn-lg" : "btn-outline"}`} onClick={() => setEndOpen(true)}>
              {travelling.length === 0 ? "🎉 Wrap up the hangout" : "End hangout"}
            </button>
            <p className="mt-2 text-center text-xs text-muted">Location sharing switches off automatically at {clockWithDay(h.endsAt)}.</p>
          </div>
        </div>
      </div>

      <Sheet open={consentOpen} onClose={() => setConsentOpen(false)} title="Share your live location?">
        <div className="space-y-3 text-sm">
          <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
            <Eye className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold">Who can see it</div>
              <div className="text-muted">
                Only people in “{h.title}”: right now that&apos;s {viewers.length} other {viewers.length === 1 ? "person" : "people"}. Anyone who joins later with the plan&apos;s link will see it too.
              </div>
              <div className="mt-2">
                <AvatarStack users={viewers.map((v) => v.user)} size={26} max={8} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold">How long</div>
              <div className="text-muted">
                Until you stop it, or {clockWithDay(h.endsAt)} at the latest. Your live coordinates are deleted when the hangout ends.
              </div>
            </div>
          </div>
          <div className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
            <Pause className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold">You&apos;re in control</div>
              <div className="text-muted">You can pause or stop at any time. While it&apos;s paused, friends just see “Paused”.</div>
            </div>
          </div>
        </div>
        <button
          className="btn btn-volt btn-lg mt-5 w-full"
          disabled={!!busy}
          onClick={async () => {
            await sharing("start");
            setConsentOpen(false);
          }}
        >
          {busy === "start" ? <Spinner /> : "Share live location"}
        </button>
        <button className="btn btn-ghost mt-1 w-full" onClick={() => setConsentOpen(false)}>
          Not now
        </button>
      </Sheet>

      <Sheet open={endOpen} onClose={() => setEndOpen(false)} title={travelling.length === 0 ? "Everyone made it! 🎉" : "End this hangout?"}>
        <p className="text-sm text-muted">
          {travelling.length === 0
            ? "This marks the hangout as complete and switches off live location for everyone."
            : `${travelling.length} ${travelling.length === 1 ? "person is" : "people are"} still on the way. Ending now stops location sharing for everyone.`}
        </p>
        <button
          className="btn btn-ink btn-lg mt-4 w-full"
          onClick={async () => {
            await api(`/api/hangouts/${h.id}/complete`, { body: {} });
            setEndOpen(false);
            mutate();
          }}
        >
          Mark as complete
        </button>
      </Sheet>
    </div>
  );
}

const rank = (s: string) => ({ on_the_way: 0, not_started: 1, paused: 2, not_sharing: 3, arrived: 4 })[s] ?? 5;

function FriendRow({ now, name, user, share, state, mode }: { now: number; name: string; user: HangoutDetail["participants"][number]["user"]; share: LiveShare | null; state: ReturnType<typeof travelState>; mode: string }) {
  const ui = STATE_UI[state];
  return (
    <div className="flex items-center gap-3 p-3">
      <Avatar user={user} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{name}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ui.cls}`}>{ui.label}</span>
        </div>
        <div className="truncate text-xs text-muted">
          {state === "arrived" && share?.arrivedAt
            ? `Arrived at ${clock(share.arrivedAt)}`
            : state === "not_sharing"
              ? "Location not shared"
              : state === "paused"
                ? "Sharing paused"
                : share?.lat != null
                  ? `${distance(share.distanceMeters)} away · updated ${ago(share.updatedAt)}`
                  : "Waiting for location…"}
        </div>
      </div>
      <div className="text-right">
        {state === "arrived" ? (
          <span className="text-lg">✅</span>
        ) : share?.etaSeconds != null && (state === "on_the_way" || state === "not_started") ? (
          <>
            <div className="font-display text-lg font-extrabold leading-none tabular-nums">{minutes(share.etaSeconds)}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {mode} ETA {clock(now + share.etaSeconds * 1000)}
              {share.etaSource === "model" ? "*" : ""}
            </div>
          </>
        ) : (
          <span className="text-lg opacity-60">{mode}</span>
        )}
      </div>
    </div>
  );
}

function MySharing({
  h,
  share,
  state,
  gps,
  busy,
  simulating,
  viewers,
  onStart,
  onPause,
  onResume,
  onStop,
  onArrived,
  onSimulate,
}: {
  h: HangoutDetail;
  share: LiveShare | null;
  state: ReturnType<typeof travelState>;
  gps: GpsState;
  busy: string | null;
  simulating: boolean;
  viewers: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onArrived: () => void;
  onSimulate: () => void;
}) {
  if (state === "arrived")
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mint/15 p-4">
        <span className="text-2xl">🙌</span>
        <div className="flex-1 text-sm">
          <div className="font-bold">You&apos;re here</div>
          <div className="text-muted">{share?.status === "active" ? "Still sharing your location." : "Location sharing is off."}</div>
        </div>
        {share?.status === "active" && (
          <button className="btn btn-soft btn-sm" onClick={onStop} disabled={!!busy}>
            Stop sharing
          </button>
        )}
      </div>
    );

  if (!share || share.status === "stopped" || share.status === "expired")
    return (
      <div className="mt-4 rounded-2xl bg-ink p-4 text-white">
        <div className="font-display text-lg font-bold">Heading out?</div>
        <p className="text-sm text-white/70">Share your live location so your crew knows when you&apos;ll get there. It&apos;s off until you turn it on.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn btn-volt" onClick={onStart}>
            Share location
          </button>
          <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={onArrived}>
            I&apos;m here
          </button>
        </div>
      </div>
    );

  const paused = share.status === "paused";
  return (
    <div className={`mt-4 rounded-2xl p-4 ${paused ? "bg-amber/15" : "bg-volt/40"}`}>
      <div className="flex items-start gap-3">
        <span className="relative mt-1 flex h-3 w-3">
          {!paused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink opacity-40" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${paused ? "bg-amber" : "bg-ink"}`} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold">{paused ? "Sharing paused" : `Sharing live with ${viewers} ${viewers === 1 ? "person" : "people"}`}</div>
          <div className="text-ink/70">
            {paused
              ? "Your friends can't see where you are."
              : simulating
                ? "Simulating your trip (demo)"
                : gps.status === "waiting"
                  ? "Getting a GPS fix…"
                  : gps.status === "denied"
                    ? "Location permission is blocked. Allow it in your browser settings."
                    : gps.status === "error"
                      ? "Can't get your location right now."
                      : `Until ${clockWithDay(h.endsAt)}${gps.accuracy ? ` · ±${Math.round(gps.accuracy)} m` : ""}`}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {paused ? (
          <button className="btn btn-ink btn-sm" onClick={onResume} disabled={!!busy}>
            <Play className="h-3.5 w-3.5" /> Resume
          </button>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={onPause} disabled={!!busy}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={onStop} disabled={!!busy}>
          <Square className="h-3.5 w-3.5" /> Stop
        </button>
        <button className="btn btn-ink btn-sm" onClick={onArrived}>
          I&apos;m here
        </button>
        {h.providers.demoMode && !paused && !simulating && (
          <button className="btn btn-soft btn-sm" onClick={onSimulate}>
            ✨ Simulate my trip
          </button>
        )}
      </div>
    </div>
  );
}
