import "server-only";
import type { LatLng, Mode } from "@/lib/types";
import { createUser } from "../auth";
import { config } from "../config";
import { newId, now, one, q, run } from "../db";
import { routeGeometry } from "../geo/routing";
import { haversine } from "../geo/util";
import { createGroup, joinByCode } from "./groups";
import { addSuggestion, createHangout, hangoutRow, setOrigin, vote } from "./hangouts";
import { startSharing, updateLocation } from "./live";

/**
 * Demo mode (WHERE2_DEMO_MODE=true) only. Builds an isolated sample world
 * around San Francisco for each visitor and drives the demo friends ("bots")
 * so the live map has movement. Real users are never simulated unless they
 * explicitly ask for it from the live screen in demo mode.
 */

const BOTS: { name: string; origin: LatLng & { label: string }; mode: Mode }[] = [
  { name: "Maya Patel", origin: { lat: 37.7638, lng: -122.469, label: "Irving St, Inner Sunset" }, mode: "transit" },
  { name: "Leo Martins", origin: { lat: 37.8007, lng: -122.4102, label: "Columbus Ave, North Beach" }, mode: "cycling" },
  { name: "Priya Shah", origin: { lat: 37.7765, lng: -122.4241, label: "Hayes St, Hayes Valley" }, mode: "walking" },
  { name: "Jonah Brooks", origin: { lat: 37.7605, lng: -122.3893, label: "3rd St, Dogpatch" }, mode: "driving" },
];

const YOU_ORIGIN = { lat: 37.7599, lng: -122.4148, label: "Valencia St, Mission" };

export async function createDemoWorld(): Promise<string> {
  const tag = newId().slice(0, 6).toLowerCase();
  const you = createUser({ email: `you-${tag}@demo.where2.local`, name: "Alex Rivera" });
  const bots = BOTS.map((b, i) => ({ ...b, id: createUser({ email: `bot${i}-${tag}@demo.where2.local`, name: b.name, isDemo: true }) }));

  const crew = createGroup(you, { name: "Weekend Crew", description: "Saturday brunch, Sunday chaos.", imageUrl: null, emoji: "🍕" });
  const code = one<{ invite_code: string }>("SELECT invite_code FROM groups WHERE id = ?", crew)!.invite_code;
  for (const b of bots) joinByCode(b.id, code);

  const study = createGroup(bots[2].id, { name: "Study Squad", description: "Finals season survival.", imageUrl: null, emoji: "📚" });
  const studyCode = one<{ invite_code: string }>("SELECT invite_code FROM groups WHERE id = ?", study)!.invite_code;
  joinByCode(you, studyCode);
  joinByCode(bots[0].id, studyCode);

  // History: two finished hangouts.
  const past = [
    { title: "Boba run", days: 6, name: "Boba Guys", address: "3491 19th St, Mission", lat: 37.7598, lng: -122.4196 },
    { title: "Picnic in the park", days: 13, name: "Mission Dolores Park", address: "Dolores St & 19th St", lat: 37.7596, lng: -122.4269 },
  ];
  for (const p of past) {
    const id = createHangout(you, crew, {
      title: p.title,
      startsAt: now() - p.days * 86400_000,
      durationMin: 150,
      mode: "transit",
      category: p.title.includes("Boba") ? "cafe" : "park",
      pollClosesAt: null,
    });
    run(
      `UPDATE hangouts SET status = 'completed', dest_name = ?, dest_address = ?, dest_lat = ?, dest_lng = ?, finalized_at = ?, completed_at = ? WHERE id = ?`,
      p.name,
      p.address,
      p.lat,
      p.lng,
      now() - p.days * 86400_000,
      now() - p.days * 86400_000 + 3 * 3600_000,
      id,
    );
  }

  // The plan in progress: tomorrow, 7pm local server time.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(19, 0, 0, 0);
  const hid = createHangout(you, crew, {
    title: "Saturday dinner",
    startsAt: start.getTime(),
    durationMin: 180,
    mode: "transit",
    category: "food",
    pollClosesAt: null,
  });
  setOrigin(you, hid, { ...YOU_ORIGIN, source: "manual", mode: "transit" });
  for (const b of bots) setOrigin(b.id, hid, { ...b.origin, source: "manual", mode: b.mode });

  const zuni = await addSuggestion(
    bots[0].id,
    hid,
    { externalId: "demo:zuni", name: "Zuni Café", address: "1658 Market St, Hayes Valley", lat: 37.7735, lng: -122.4216, category: "food", kind: "restaurant", imageUrl: null, rating: null, ratingCount: null },
    "member",
    { deferTravel: true },
  );
  const tonys = await addSuggestion(
    bots[1].id,
    hid,
    { externalId: "demo:tonys", name: "Tony's Pizza Napoletana", address: "1570 Stockton St, North Beach", lat: 37.8002, lng: -122.4092, category: "food", kind: "restaurant", imageUrl: null, rating: null, ratingCount: null },
    "member",
    { deferTravel: true },
  );
  vote(bots[0].id, hid, zuni);
  vote(bots[2].id, hid, zuni);
  vote(bots[1].id, hid, tonys);
  return you;
}

const isBot = (userId: string) => !!one("SELECT 1 FROM users WHERE id = ? AND is_demo = 1", userId);

/** In demo mode, an undecided demo friend casts a vote for the fairest option shortly after a change. */
export function demoReact(hangoutId: string) {
  if (!config.demoMode) return;
  setTimeout(() => {
    try {
      const h = hangoutRow(hangoutId);
      if (h.status !== "planning") return;
      const undecided = q<{ user_id: string }>(
        `SELECT p.user_id FROM participants p JOIN users u ON u.id = p.user_id
          WHERE p.hangout_id = ? AND u.is_demo = 1 AND p.user_id NOT IN (SELECT user_id FROM votes WHERE hangout_id = ?)`,
        hangoutId,
        hangoutId,
      );
      if (!undecided.length) return;
      const options = q<{ id: string; travel_json: string | null }>("SELECT id, travel_json FROM suggestions WHERE hangout_id = ?", hangoutId);
      const fairest = options
        .map((o) => ({ id: o.id, f: o.travel_json ? (JSON.parse(o.travel_json).fairness as number | null) ?? 0 : 0 }))
        .sort((a, b) => b.f - a.f)[0];
      if (fairest) vote(undecided[0].user_id, hangoutId, fairest.id);
    } catch {
      /* hangout may be gone */
    }
  }, 3500);
}

// ---------- Live journey simulation ----------

type Sim = { path: LatLng[]; cum: number[]; startAt: number; durationMs: number; timer: NodeJS.Timeout };
type G = typeof globalThis & { __where2sims?: Map<string, Sim> };
const sims = () => ((globalThis as G).__where2sims ??= new Map());

function pointAlong(sim: Sim, frac: number): LatLng {
  const total = sim.cum[sim.cum.length - 1];
  const target = total * Math.min(1, Math.max(0, frac));
  const i = sim.cum.findIndex((c) => c >= target);
  if (i <= 0) return sim.path[Math.max(0, i)];
  const seg = sim.cum[i] - sim.cum[i - 1] || 1;
  const t = (target - sim.cum[i - 1]) / seg;
  const a = sim.path[i - 1];
  const b = sim.path[i];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

async function simulate(hangoutId: string, userId: string, from: LatLng, mode: Mode, delayMs: number, speedup: number) {
  const k = `${hangoutId}:${userId}`;
  if (sims().has(k)) return;
  const h = hangoutRow(hangoutId);
  if (h.dest_lat == null || h.dest_lng == null) return;
  const route = await routeGeometry(from, { lat: h.dest_lat, lng: h.dest_lng }, mode);
  const cum = [0];
  for (let i = 1; i < route.path.length; i++) cum.push(cum[i - 1] + haversine(route.path[i - 1], route.path[i]));
  const sim: Sim = {
    path: route.path,
    cum,
    startAt: Date.now() + delayMs,
    durationMs: Math.max(45_000, (route.seconds * 1000) / speedup),
    timer: setInterval(() => {
      const frac = (Date.now() - sim.startAt) / sim.durationMs;
      const live = one<{ status: string }>("SELECT status FROM hangouts WHERE id = ?", hangoutId);
      const share = one<{ status: string; arrived_at: number | null }>(
        "SELECT status, arrived_at FROM location_shares WHERE hangout_id = ? AND user_id = ?",
        hangoutId,
        userId,
      );
      if (!live || live.status !== "live" || !share || share.status !== "active" || share.arrived_at) {
        clearInterval(sim.timer);
        sims().delete(k);
        return;
      }
      const p = pointAlong(sim, frac);
      updateLocation(userId, hangoutId, { ...p, accuracy: 10 }).catch(() => {});
    }, 2000),
  };
  sims().set(k, sim);
  // Post the starting point right away so the friend appears on the map.
  updateLocation(userId, hangoutId, { ...from, accuracy: 10 }).catch(() => {});
}

/** Start journeys for every demo friend in a live hangout (idempotent). */
export async function ensureDemoJourneys(hangoutId: string) {
  if (!config.demoMode) return;
  const h = hangoutRow(hangoutId);
  if (h.status !== "live") return;
  const bots = q<{ user_id: string; origin_lat: number; origin_lng: number; mode: Mode | null }>(
    `SELECT p.user_id, p.origin_lat, p.origin_lng, p.mode FROM participants p JOIN users u ON u.id = p.user_id
      WHERE p.hangout_id = ? AND u.is_demo = 1 AND p.rsvp != 'declined' AND p.origin_lat IS NOT NULL`,
    hangoutId,
  );
  let i = 0;
  for (const b of bots) {
    const share = one<{ status: string }>("SELECT status FROM location_shares WHERE hangout_id = ? AND user_id = ?", hangoutId, b.user_id);
    if (!share) startSharing(b.user_id, hangoutId);
    else if (share.status !== "active") continue;
    void simulate(hangoutId, b.user_id, { lat: b.origin_lat, lng: b.origin_lng }, b.mode ?? h.mode, 1500 + i * 6000, 10 + i * 2);
    i++;
  }
}

/** Demo mode only: move the signed-in user from their starting point too. */
export async function simulateMe(userId: string, hangoutId: string) {
  if (!config.demoMode) throw new Error("Simulation is only available in demo mode.");
  if (isBot(userId)) return;
  const h = hangoutRow(hangoutId);
  const p = one<{ origin_lat: number | null; origin_lng: number | null; mode: Mode | null }>(
    "SELECT origin_lat, origin_lng, mode FROM participants WHERE hangout_id = ? AND user_id = ?",
    hangoutId,
    userId,
  );
  if (!p?.origin_lat || !p.origin_lng) throw new Error("Set a starting point first.");
  await simulate(hangoutId, userId, { lat: p.origin_lat, lng: p.origin_lng }, p.mode ?? h.mode, 0, 12);
}
