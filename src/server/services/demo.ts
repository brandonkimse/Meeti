import "server-only";
import { randomBytes } from "node:crypto";
import type { LatLng, Mode } from "@/lib/types";
import { createBotProfile } from "../auth";
import { background } from "../background";
import { config } from "../config";
import { newId, now, one, q, run } from "../db";
import { routeGeometry } from "../geo/routing";
import { haversine } from "../geo/util";
import { supabaseAdmin, supabaseServer } from "../supabase";
import { createGroup, joinByCode } from "./groups";
import { addSuggestion, createHangout, hangoutRow, setOrigin, vote } from "./hangouts";
import { startSharing, updateLocation } from "./live";

/**
 * Demo mode (MEETI_DEMO_MODE=true) only. Builds an isolated sample world
 * around San Francisco for each visitor. Demo friends are profiles without a
 * login. Their journeys are precomputed and stored, then advanced whenever a
 * viewer's browser calls `tickDemo`, so nothing depends on a long-running server.
 */

const BOTS: { name: string; origin: LatLng & { label: string }; mode: Mode }[] = [
  { name: "Maya Patel", origin: { lat: 37.7638, lng: -122.469, label: "Irving St, Inner Sunset" }, mode: "transit" },
  { name: "Leo Martins", origin: { lat: 37.8007, lng: -122.4102, label: "Columbus Ave, North Beach" }, mode: "cycling" },
  { name: "Priya Shah", origin: { lat: 37.7765, lng: -122.4241, label: "Hayes St, Hayes Valley" }, mode: "walking" },
  { name: "Jonah Brooks", origin: { lat: 37.7605, lng: -122.3893, label: "3rd St, Dogpatch" }, mode: "driving" },
];

const YOU_ORIGIN = { lat: 37.7599, lng: -122.4148, label: "Valencia St, Mission" };

/** Creates a demo login plus its sample world, and signs the visitor in. */
export async function createDemoWorld(): Promise<string> {
  const tag = newId().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const email = `you-${tag}@demo.example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Alex Rivera" },
  });
  if (error || !data.user) throw new Error(`Couldn't create a demo account: ${error?.message ?? "unknown error"}`);
  const you = data.user.id;
  await run("INSERT INTO profiles (id, email, name) VALUES (?, ?, 'Alex Rivera') ON CONFLICT (id) DO NOTHING", you, email);

  const bots: ((typeof BOTS)[number] & { id: string })[] = [];
  for (const b of BOTS) bots.push({ ...b, id: await createBotProfile(b.name) });

  const crew = await createGroup(you, { name: "Weekend Crew", description: "Saturday brunch, Sunday chaos.", imageUrl: null, emoji: "🍕" });
  const code = (await one<{ invite_code: string }>("SELECT invite_code FROM groups WHERE id = ?", crew))!.invite_code;
  for (const b of bots) await joinByCode(b.id, code);

  const study = await createGroup(bots[2].id, { name: "Study Squad", description: "Finals season survival.", imageUrl: null, emoji: "📚" });
  const studyCode = (await one<{ invite_code: string }>("SELECT invite_code FROM groups WHERE id = ?", study))!.invite_code;
  await joinByCode(you, studyCode);
  await joinByCode(bots[0].id, studyCode);

  // History: two finished hangouts.
  const past = [
    { title: "Boba run", days: 6, name: "Boba Guys", address: "3491 19th St, Mission", lat: 37.7598, lng: -122.4196, category: "cafe" as const },
    { title: "Picnic in the park", days: 13, name: "Mission Dolores Park", address: "Dolores St & 19th St", lat: 37.7596, lng: -122.4269, category: "park" as const },
  ];
  for (const p of past) {
    const at = now() - p.days * 86400_000;
    const id = await createHangout(you, crew, { title: p.title, startsAt: now(), durationMin: 150, mode: "transit", category: p.category, pollClosesAt: null });
    await run(
      `UPDATE hangouts SET status = 'completed', starts_at = ?, ends_at = ?, dest_name = ?, dest_address = ?, dest_lat = ?, dest_lng = ?, finalized_at = ?, completed_at = ? WHERE id = ?`,
      at,
      at + 150 * 60_000,
      p.name,
      p.address,
      p.lat,
      p.lng,
      at,
      at + 3 * 3600_000,
      id,
    );
  }

  // The plan in progress: tomorrow, 7pm server time.
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(19, 0, 0, 0);
  const hid = await createHangout(you, crew, { title: "Saturday dinner", startsAt: start.getTime(), durationMin: 180, mode: "transit", category: "food", pollClosesAt: null });
  await setOrigin(you, hid, { ...YOU_ORIGIN, source: "manual", mode: "transit" });
  for (const b of bots) await setOrigin(b.id, hid, { ...b.origin, source: "manual", mode: b.mode });

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
  await vote(bots[0].id, hid, zuni);
  await vote(bots[2].id, hid, zuni);
  await vote(bots[1].id, hid, tonys);

  // Sign the visitor in (sets the Supabase auth cookies).
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Couldn't sign in to the demo: ${signInError.message}`);
  return you;
}

/** In demo mode, an undecided demo friend votes for the fairest option shortly after a change. */
export function demoReact(hangoutId: string) {
  if (!config.demoMode) return;
  background(async () => {
    await new Promise((r) => setTimeout(r, 3000));
    const h = await hangoutRow(hangoutId).catch(() => null);
    if (!h || h.status !== "planning") return;
    const undecided = await q<{ user_id: string }>(
      `SELECT p.user_id FROM participants p JOIN profiles u ON u.id = p.user_id
        WHERE p.hangout_id = ? AND u.is_demo = 1 AND p.user_id NOT IN (SELECT user_id FROM votes WHERE hangout_id = ?)
        ORDER BY p.seq`,
      hangoutId,
      hangoutId,
    );
    if (!undecided.length) return;
    const options = await q<{ id: string; travel_json: string | null }>("SELECT id, travel_json FROM suggestions WHERE hangout_id = ?", hangoutId);
    const fairest = options
      .map((o) => ({ id: o.id, f: o.travel_json ? ((JSON.parse(o.travel_json).fairness as number | null) ?? 0) : 0 }))
      .sort((a, b) => b.f - a.f)[0];
    if (fairest) await vote(undecided[0].user_id, hangoutId, fairest.id);
  });
}

// ---------- Live journey simulation ----------

type Journey = { user_id: string; path_json: string; start_at: number; duration_ms: number };

function pointAlong(path: LatLng[], frac: number): LatLng {
  if (path.length < 2) return path[0];
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  const target = cum[cum.length - 1] * Math.min(1, Math.max(0, frac));
  const i = Math.max(1, cum.findIndex((c) => c >= target));
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (target - cum[i - 1]) / seg;
  const a = path[i - 1];
  const b = path[i];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

async function planJourney(hangoutId: string, userId: string, from: LatLng, mode: Mode, delayMs: number, speedup: number) {
  if (await one("SELECT 1 FROM demo_journeys WHERE hangout_id = ? AND user_id = ?", hangoutId, userId)) return;
  const h = await hangoutRow(hangoutId);
  if (h.dest_lat == null || h.dest_lng == null) return;
  const route = await routeGeometry(from, { lat: h.dest_lat, lng: h.dest_lng }, mode);
  // Thin long paths so the stored row stays small.
  const step = Math.max(1, Math.floor(route.path.length / 300));
  const path = route.path.filter((_, i) => i % step === 0 || i === route.path.length - 1);
  await run(
    "INSERT INTO demo_journeys (hangout_id, user_id, path_json, start_at, duration_ms) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",
    hangoutId,
    userId,
    JSON.stringify(path),
    now() + delayMs,
    Math.round(Math.max(45_000, (route.seconds * 1000) / speedup)),
  );
}

/** Start journeys for every demo friend in a live hangout (idempotent). */
export async function ensureDemoJourneys(hangoutId: string) {
  if (!config.demoMode) return;
  const h = await hangoutRow(hangoutId);
  if (h.status !== "live") return;
  const bots = await q<{ user_id: string; origin_lat: number; origin_lng: number; mode: Mode | null }>(
    `SELECT p.user_id, p.origin_lat, p.origin_lng, p.mode FROM participants p JOIN profiles u ON u.id = p.user_id
      WHERE p.hangout_id = ? AND u.is_demo = 1 AND p.rsvp != 'declined' AND p.origin_lat IS NOT NULL ORDER BY p.seq`,
    hangoutId,
  );
  let i = 0;
  for (const b of bots) {
    const share = await one<{ status: string }>("SELECT status FROM location_shares WHERE hangout_id = ? AND user_id = ?", hangoutId, b.user_id);
    if (!share) await startSharing(b.user_id, hangoutId);
    else if (share.status !== "active") continue;
    await planJourney(hangoutId, b.user_id, { lat: b.origin_lat, lng: b.origin_lng }, b.mode ?? h.mode, 1500 + i * 6000, 10 + i * 2);
    i++;
  }
}

/** Demo mode only: move the signed-in user from their starting point too. */
export async function simulateMe(userId: string, hangoutId: string) {
  if (!config.demoMode) throw new Error("Simulation is only available in demo mode.");
  const h = await hangoutRow(hangoutId);
  const p = await one<{ origin_lat: number | null; origin_lng: number | null; mode: Mode | null }>(
    "SELECT origin_lat, origin_lng, mode FROM participants WHERE hangout_id = ? AND user_id = ?",
    hangoutId,
    userId,
  );
  if (p?.origin_lat == null || p.origin_lng == null) throw new Error("Set a starting point first.");
  await planJourney(hangoutId, userId, { lat: p.origin_lat, lng: p.origin_lng }, p.mode ?? h.mode, 0, 12);
}

/** Advance every stored journey in this hangout to "now". Called by viewers' browsers. */
export async function tickDemo(hangoutId: string) {
  if (!config.demoMode) return;
  const journeys = await q<Journey>("SELECT user_id, path_json, start_at, duration_ms FROM demo_journeys WHERE hangout_id = ?", hangoutId);
  const t = now();
  await Promise.all(
    journeys.map(async (j) => {
      if (t < j.start_at) return;
      const share = await one<{ status: string; arrived_at: number | null }>(
        "SELECT status, arrived_at FROM location_shares WHERE hangout_id = ? AND user_id = ?",
        hangoutId,
        j.user_id,
      );
      if (!share || share.status !== "active" || share.arrived_at) {
        await run("DELETE FROM demo_journeys WHERE hangout_id = ? AND user_id = ?", hangoutId, j.user_id);
        return;
      }
      const p = pointAlong(JSON.parse(j.path_json) as LatLng[], (t - j.start_at) / j.duration_ms);
      await updateLocation(j.user_id, hangoutId, { ...p, accuracy: 10 }).catch(() => {});
    }),
  );
}
