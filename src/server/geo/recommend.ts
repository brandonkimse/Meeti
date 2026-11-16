import "server-only";
import type { Category, LatLng, MemberTravel, PlaceCandidate, Recommendation, RecommendationSet } from "@/lib/types";
import { nearbyPlaces } from "./places";
import { travelMatrix, type Leg, type Origin } from "./routing";
import { centroid, fairnessCost, haversine, summarize } from "./util";

/**
 * Where2's fair meeting-spot recommender.
 *
 * 1. Lay a grid of candidate meeting areas over the region spanned by everyone's
 *    starting points (plus margin, plus the centroid).
 * 2. Compute real travel times from every participant (in their own mode) to
 *    every grid point, and score each point with `fairnessCost` — a blend of the
 *    group's average trip and the longest trip, with a penalty for outliers.
 * 3. Keep the best few well-separated areas and look up actual places of the
 *    requested category around them.
 * 4. Re-score those real places with real travel times and return the best.
 */

const GRID = 7;

function toTravel(origins: Origin[], legs: Map<string, Leg[]>, j: number): MemberTravel[] {
  return origins.map((o) => {
    const l = legs.get(o.id)?.[j];
    return { userId: o.id, mode: o.mode, seconds: l?.seconds ?? null, meters: l?.meters ?? null, source: l?.source ?? "model" };
  });
}

function costOf(origins: Origin[], legs: Map<string, Leg[]>, j: number): number {
  const times: number[] = [];
  for (const o of origins) {
    const s = legs.get(o.id)?.[j]?.seconds;
    if (s == null) return Infinity; // unreachable for someone
    times.push(s);
  }
  return fairnessCost(times);
}

function candidateAreas(origins: LatLng[]): { points: LatLng[]; diag: number } {
  const lats = origins.map((o) => o.lat);
  const lngs = origins.map((o) => o.lng);
  let [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // Ensure a minimum search window (~1.2 km) so co-located groups still get options.
  const minSpan = 0.011;
  if (maxLat - minLat < minSpan) [minLat, maxLat] = [(minLat + maxLat) / 2 - minSpan / 2, (minLat + maxLat) / 2 + minSpan / 2];
  if (maxLng - minLng < minSpan) [minLng, maxLng] = [(minLng + maxLng) / 2 - minSpan / 2, (minLng + maxLng) / 2 + minSpan / 2];
  const padLat = (maxLat - minLat) * 0.12;
  const padLng = (maxLng - minLng) * 0.12;
  minLat -= padLat;
  maxLat += padLat;
  minLng -= padLng;
  maxLng += padLng;
  const points: LatLng[] = [centroid(origins)];
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++)
      points.push({ lat: minLat + ((maxLat - minLat) * i) / (GRID - 1), lng: minLng + ((maxLng - minLng) * j) / (GRID - 1) });
  const diag = haversine({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
  return { points, diag };
}

const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

function explain(r: Recommendation, best: { avg: number; max: number }): string {
  const t = r.travel;
  if (t.avg == null || t.max == null) return "";
  const bits: string[] = [];
  if (t.counted > 1 && (t.fairness ?? 0) >= 0.96) bits.push("Nearly equal trips for everyone");
  else if (t.counted > 1 && t.max - (t.min ?? 0) <= 6 * 60) bits.push("Trips within a few minutes of each other");
  if (Math.abs(t.avg - best.avg) < 30) bits.push("Shortest average trip");
  if (Math.abs(t.max - best.max) < 30 && t.counted > 1) bits.push(`Nobody travels more than ${fmtMin(t.max)}`);
  if (!bits.length) bits.push(`Everyone there within ${fmtMin(t.max)}`);
  return bits.slice(0, 2).join(" · ");
}

export async function recommend(
  origins: Origin[],
  category: Category,
  departAt: number,
): Promise<Omit<RecommendationSet, "key" | "generatedAt" | "category">> {
  if (!origins.length) throw new Error("Add at least one starting point to get recommendations.");
  const notes: string[] = [];

  // 1–2. Score candidate areas.
  const { points, diag } = candidateAreas(origins);
  const gridLegs = await travelMatrix(origins, points, departAt);
  const scored = points
    .map((p, j) => ({ p, cost: costOf(origins, gridLegs, j) }))
    .filter((x) => Number.isFinite(x.cost))
    .sort((a, b) => a.cost - b.cost);
  if (!scored.length) throw new Error("Couldn't find any area reachable by everyone.");

  // 3. Pick up to 3 well-separated areas.
  const minSep = Math.max(450, diag * 0.16);
  const areas: LatLng[] = [];
  for (const s of scored) {
    if (areas.every((a) => haversine(a, s.p) > minSep)) areas.push(s.p);
    if (areas.length === 3) break;
  }
  const radius = Math.min(2500, Math.max(500, diag * 0.1));

  let places: (PlaceCandidate & { area: number })[] = [];
  const gather = async (r: number) => {
    const lists = await Promise.allSettled(areas.map((a) => nearbyPlaces(a, r, category)));
    const seen = new Set<string>();
    const out: (PlaceCandidate & { area: number })[] = [];
    lists.forEach((l, ai) => {
      if (l.status !== "fulfilled") return;
      // Take the closest options per area so every area is represented.
      for (const p of l.value.slice(0, ai === 0 ? 20 : 12)) {
        const dupe = out.some((o) => o.name === p.name && haversine(o, p) < 80);
        if (seen.has(p.externalId) || dupe) continue;
        seen.add(p.externalId);
        out.push({ ...p, area: ai });
      }
    });
    if (lists.every((l) => l.status === "rejected")) throw new Error("The places service is unavailable right now. Try again shortly.");
    return out;
  };
  places = await gather(radius);
  if (places.length < 4) places = await gather(radius * 2.2);
  if (!places.length) {
    return { center: areas[0], areas, items: [], notes: ["No places of this kind near the fairest areas. Try another category or search for a place."] };
  }

  // 4. Score real places with real travel times.
  const legs = await travelMatrix(origins, places, departAt);
  const ranked = places
    .map(({ area, ...p }, j) => {
      const travel = summarize(toTravel(origins, legs, j));
      let score = costOf(origins, legs, j);
      if (p.rating != null) score *= 1 - 0.05 * Math.max(-1, Math.min(1, p.rating - 4.2));
      return { item: { ...p, travel, score, reason: "" } as Recommendation, area };
    })
    .filter((r) => Number.isFinite(r.item.score))
    .sort((a, b) => a.item.score - b.item.score);
  // Keep variety: at most 3 picks per area first, then fill any gaps by score.
  const items: Recommendation[] = [];
  const perArea = new Map<number, number>();
  for (const r of ranked) {
    if (items.length === 6) break;
    const n = perArea.get(r.area) ?? 0;
    if (n >= 3) continue;
    items.push(r.item);
    perArea.set(r.area, n + 1);
  }
  for (const r of ranked) if (items.length < 6 && !items.includes(r.item)) items.push(r.item);
  items.sort((a, b) => a.score - b.score);

  if (items.length) {
    const best = {
      avg: Math.min(...items.map((i) => i.travel.avg ?? Infinity)),
      max: Math.min(...items.map((i) => i.travel.max ?? Infinity)),
    };
    for (const it of items) it.reason = explain(it, best);
  }

  const sources = new Set(items.flatMap((i) => i.travel.perMember.map((m) => `${m.mode}:${m.source}`)));
  if ([...sources].some((s) => s === "transit:model"))
    notes.push("Transit times are estimates based on road distance. Add a Google Maps key for live schedules.");
  if ([...sources].some((s) => s.endsWith(":model") && !s.startsWith("transit")))
    notes.push("Some times are rough estimates because the routing service didn't respond.");

  return { center: areas[0], areas, items, notes };
}
