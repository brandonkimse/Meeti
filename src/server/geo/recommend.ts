import "server-only";
import type { Category, LatLng, MemberTravel, PlaceCandidate, Recommendation, RecommendationSet } from "@/lib/types";
import { busyness, nearbyPlaces, nearbyStations } from "./places";
import { travelMatrix, type Leg, type Origin } from "./routing";
import { centroid, fairnessCost, haversine, summarize } from "./util";

/**
 * Meeti's fair meeting-spot recommender.
 *
 * 1. Lay a grid of candidate meeting areas over the region spanned by everyone's
 *    starting points (plus margin, plus the centroid), and add nearby train and
 *    subway stations, which make natural meeting hubs.
 * 2. Compute real travel times from every participant (in their own mode) to
 *    every candidate, and score each with `fairnessCost`: a blend of the
 *    group's average trip and the longest trip, with a penalty for outliers.
 * 3. Penalise quiet areas (a hillside or a field) by how few venues are around,
 *    so a lively district a few minutes further wins over the empty midpoint.
 * 4. Keep the best few well-separated areas and look up actual places of the
 *    requested category around them.
 * 5. Re-score those real places with real travel times and popularity, return
 *    the best, and flag the most popular one that's still a fair trip.
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

/** Run `fn` over `items` with at most `n` in flight (keeps public APIs happy). */
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).catch(() => null);
      }
    }),
  );
  return out;
}

/** 0 for an empty area, 1 for a busy one. */
const liveliness = (venues: number) => Math.min(1, venues / 35);
/** How much travel time an empty area "costs" compared with a lively one. */
const QUIET_PENALTY = 0.6;
/** How strongly a place's own popularity improves its score. */
const POPULARITY_WEIGHT = 0.2;

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

/**
 * 0–1: how popular a place looks. Google gives review counts; for OpenStreetMap
 * places we use how many other venues cluster around it and how lively its area is.
 */
function popularityOf(p: PlaceCandidate, all: PlaceCandidate[], areaLife: number): number {
  if (p.ratingCount != null) {
    const reviews = Math.min(1, Math.log10(1 + p.ratingCount) / 3.5); // ~3,000 reviews = 1
    const quality = p.rating == null ? 1 : Math.max(0.4, Math.min(1, (p.rating - 3) / 1.6));
    return reviews * quality;
  }
  const neighbours = all.filter((o) => o !== p && haversine(o, p) < 250).length;
  return 0.5 * Math.min(1, neighbours / 10) + 0.5 * areaLife;
}

export async function recommend(
  origins: Origin[],
  category: Category,
  departAt: number,
): Promise<Omit<RecommendationSet, "key" | "generatedAt" | "category">> {
  if (!origins.length) throw new Error("Add at least one starting point to get recommendations.");
  const notes: string[] = [];

  // 1–2. Score candidate areas: the grid plus nearby stations.
  const { points: grid, diag } = candidateAreas(origins);
  const stations = await nearbyStations(centroid(origins), Math.max(1500, diag / 2)).catch(() => [] as LatLng[]);
  const points = [...grid, ...stations];
  const gridLegs = await travelMatrix(origins, points, departAt);
  let scored = points
    .map((p, j) => ({ p, cost: costOf(origins, gridLegs, j), venues: null as number | null }))
    .filter((x) => Number.isFinite(x.cost))
    .sort((a, b) => a.cost - b.cost);
  if (!scored.length) throw new Error("Couldn't find any area reachable by everyone.");

  // 3. Check how lively the fairest candidates are, and penalise quiet ones.
  const best = scored[0].cost;
  // Skip near-duplicates so each lookup tells us about a different neighbourhood.
  const shortlist: typeof scored = [];
  for (const x of scored) {
    if (x.cost > best * 1.6 || shortlist.length === 10) break;
    if (shortlist.every((o) => haversine(o.p, x.p) > 350)) shortlist.push(x);
  }
  const counts = await mapLimit(shortlist, 2, (x) => busyness(x.p));
  shortlist.forEach((x, i) => (x.venues = counts[i]));
  if (counts.some((c) => c != null)) {
    // Only areas we could check compete, so an unchecked hillside can't sneak in.
    scored = shortlist
      .map((x) => ({ ...x, cost: x.venues == null ? x.cost * (1 + QUIET_PENALTY / 2) : x.cost * (1 + QUIET_PENALTY * (1 - liveliness(x.venues))) }))
      .sort((a, b) => a.cost - b.cost);
  }

  // 4. Pick up to 3 well-separated areas.
  const minSep = Math.max(450, diag * 0.16);
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.every((a) => haversine(a.p, s.p) > minSep)) picked.push(s);
    if (picked.length === 3) break;
  }
  const areas = picked.map((a) => a.p);
  const areaLife = picked.map((a) => (a.venues == null ? 0.5 : liveliness(a.venues)));
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

  // 5. Score real places with real travel times and popularity.
  const legs = await travelMatrix(origins, places, departAt);
  const ranked = places
    .map(({ area, ...p }, j) => {
      const travel = summarize(toTravel(origins, legs, j));
      const popularity = popularityOf(p, places, areaLife[area] ?? 0.5);
      let score = costOf(origins, legs, j);
      if (p.rating != null) score *= 1 - 0.05 * Math.max(-1, Math.min(1, p.rating - 4.2));
      score *= 1 - POPULARITY_WEIGHT * popularity;
      return { item: { ...p, travel, score, reason: "", popularity } as Recommendation, area };
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

  if (items.length) {
    const quickest = {
      avg: Math.min(...items.map((i) => i.travel.avg ?? Infinity)),
      max: Math.min(...items.map((i) => i.travel.max ?? Infinity)),
    };
    // Popular pick: the best-loved place that's still a fair trip for everyone.
    const fairEnough = (r: Recommendation) =>
      r.travel.avg != null && r.travel.max != null && r.travel.avg <= quickest.avg * 1.3 + 300 && r.travel.max <= quickest.max * 1.3 + 300;
    const pop = ranked
      .map((r) => r.item)
      .filter(fairEnough)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.score - b.score)[0];
    if (pop && (pop.popularity ?? 0) >= 0.35) {
      pop.popular = true;
      if (!items.includes(pop)) items[items.length === 6 ? 5 : items.length] = pop;
    }
    items.sort((a, b) => a.score - b.score);
    for (const it of items) {
      it.reason = explain(it, quickest);
      if (it.popular) {
        const why = it.ratingCount ? `${it.ratingCount.toLocaleString("en-US")} reviews` : "Lively area with lots nearby";
        it.reason = [why, it.reason.split(" · ")[0]].filter(Boolean).join(" · ");
      }
    }
  }

  const sources = new Set(items.flatMap((i) => i.travel.perMember.map((m) => `${m.mode}:${m.source}`)));
  if ([...sources].some((s) => s === "transit:model"))
    notes.push("Transit times are estimates based on distance, not live schedules, so allow a little extra time.");
  if ([...sources].some((s) => s.endsWith(":model") && !s.startsWith("transit")))
    notes.push("Some times are rough estimates because the routing service didn't respond.");

  return { center: areas[0], areas, items, notes };
}
