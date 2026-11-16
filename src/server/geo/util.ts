import type { LatLng, Mode, TravelSummary, MemberTravel } from "@/lib/types";

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Typical door-to-door urban speeds in m/s, used only when routing is unavailable. */
export const MODE_SPEED: Record<Mode, number> = {
  walking: 1.35,
  cycling: 4.2,
  driving: 8.5,
  transit: 6.0,
};

/** Road distances are rarely straight lines. */
export const DETOUR = 1.3;

/**
 * Public-transit model used when no transit provider is configured:
 * short trips are walked; longer ones pay a fixed access/egress + wait
 * overhead and then move at an average in-vehicle speed over the road distance.
 */
export function transitSecondsFromRoadMeters(roadMeters: number): number {
  const walk = roadMeters / MODE_SPEED.walking;
  const ride = 7 * 60 + 5 * 60 + roadMeters / MODE_SPEED.transit;
  return Math.min(walk, ride);
}

export function modelSeconds(a: LatLng, b: LatLng, mode: Mode): { seconds: number; meters: number } {
  const meters = haversine(a, b) * DETOUR;
  const seconds = mode === "transit" ? transitSecondsFromRoadMeters(meters) : meters / MODE_SPEED[mode];
  return { seconds, meters };
}

export function summarize(perMember: MemberTravel[]): TravelSummary {
  const times = perMember.map((m) => m.seconds).filter((s): s is number => s != null);
  if (!times.length) return { perMember, avg: null, max: null, min: null, fairness: null, counted: 0 };
  const sum = times.reduce((a, b) => a + b, 0);
  const sumSq = times.reduce((a, b) => a + b * b, 0);
  return {
    perMember,
    avg: sum / times.length,
    max: Math.max(...times),
    min: Math.min(...times),
    fairness: sumSq > 0 ? (sum * sum) / (times.length * sumSq) : 1,
    counted: times.length,
  };
}

/**
 * The cost Meeti minimises. It blends the group's average trip with the
 * longest single trip (so nobody gets stuck with an outsized journey), and adds
 * a steep penalty when one person travels much farther than the typical member.
 */
export function fairnessCost(times: number[]): number {
  if (!times.length) return Infinity;
  const sorted = [...times].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const outlier = Math.max(0, max - Math.max(1.5 * median, median + 10 * 60));
  return 0.55 * mean + 0.45 * max + 1.5 * outlier;
}

export function centroid(points: LatLng[]): LatLng {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 10000, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

/** Tiny TTL cache so repeat lookups (and polite rate limits) stay cheap. */
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 2000) {}
  get(k: string): V | undefined {
    const hit = this.m.get(k);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.m.delete(k);
      return undefined;
    }
    return hit.v;
  }
  set(k: string, v: V) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}
