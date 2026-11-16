import "server-only";
import type { LatLng, Mode, TravelSource } from "@/lib/types";
import { config } from "../config";
import { fetchJson, modelSeconds, transitSecondsFromRoadMeters, TtlCache } from "./util";

export type Leg = { seconds: number | null; meters: number | null; source: TravelSource };
export type Origin = LatLng & { id: string; mode: Mode };

/**
 * Travel-time engine.
 * - walking / cycling / driving: OSRM table service (real road & path networks).
 * - transit: Google Distance Matrix when GOOGLE_MAPS_API_KEY is set; otherwise a
 *   labelled model built on real road distances from the car network.
 * Any failure falls back to a labelled straight-line model so planning never stalls.
 */

const matrixCache = new TtlCache<Leg>(1000 * 60 * 20, 20000);
const key = (a: LatLng, b: LatLng, mode: Mode) =>
  `${mode}:${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

type OsrmTable = { code: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
type OsrmRoute = {
  code: string;
  routes?: { duration: number; distance: number; geometry?: { coordinates: [number, number][] } }[];
};

/* ---------- Polite request queue ---------- */

/**
 * Public routing servers are shared, rate-limited resources. Requests to each
 * host are serialized with a minimum gap and retried with backoff on HTTP 429.
 * Self-hosted OSRM can raise the throughput via WHERE2_ROUTING_CONCURRENCY / _GAP_MS.
 */
type Lane = { active: number; last: number; queue: (() => void)[] };
const lanes = new Map<string, Lane>();
const MAX_CONCURRENT = Number(process.env.WHERE2_ROUTING_CONCURRENCY || 1);
const MIN_GAP_MS = Number(process.env.WHERE2_ROUTING_GAP_MS ?? 1000);

async function limited<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = new URL(url).host;
  let lane = lanes.get(host);
  if (!lane) lanes.set(host, (lane = { active: 0, last: 0, queue: [] }));
  while (lane.active >= MAX_CONCURRENT) await new Promise<void>((r) => lane.queue.push(r));
  lane.active++;
  try {
    const wait = lane.last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return await fn();
  } finally {
    lane.last = Date.now();
    lane.active--;
    lane.queue.shift()?.();
  }
}

/** Circuit breaker: a host that is unreachable is skipped for a while instead of timing out again. */
const downUntil = new Map<string, number>();

async function osrmGet<T>(url: string, timeoutMs = 8000): Promise<T> {
  const host = new URL(url).host;
  if ((downUntil.get(host) ?? 0) > Date.now()) throw new Error(`${host} temporarily unavailable`);
  for (let attempt = 0; ; attempt++) {
    try {
      return await limited(url, () => fetchJson<T>(url, { headers: { "User-Agent": config.userAgent }, timeoutMs }));
    } catch (e) {
      const msg = (e as Error).message;
      if (attempt < 2 && /^429/.test(msg)) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!/^\d{3} /.test(msg) || /^429/.test(msg)) downUntil.set(host, Date.now() + 60_000);
      throw e;
    }
  }
}

/* ---------- Engines ---------- */

type Engine = "car" | "foot" | "bike" | "google-transit";

function engineFor(mode: Mode): Engine {
  if (mode === "walking") return "foot";
  if (mode === "cycling") return "bike";
  if (mode === "transit" && config.googleMapsKey) return "google-transit";
  return "car"; // driving, and modelled transit (which needs road distances)
}

const OSRM_BASE: Record<Exclude<Engine, "google-transit">, string> = {
  car: config.osrm.driving,
  foot: config.osrm.walking,
  bike: config.osrm.cycling,
};

/** One OSRM table request: rows = sources, cols = destinations. */
async function osrmTable(engine: Exclude<Engine, "google-transit">, sources: LatLng[], dests: LatLng[]): Promise<Leg[][]> {
  const coords = [...sources, ...dests].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const src = sources.map((_, i) => i).join(";");
  const dst = dests.map((_, i) => i + sources.length).join(";");
  const query = `table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration,distance`;
  let res: OsrmTable;
  try {
    res = await osrmGet<OsrmTable>(`${OSRM_BASE[engine]}/${query}`);
  } catch (e) {
    // Car routing has a second public server to fall back on.
    if (engine !== "car" || !config.osrmCarFallback) throw e;
    res = await osrmGet<OsrmTable>(`${config.osrmCarFallback}/${query}`);
  }
  if (res.code !== "Ok" || !res.durations) throw new Error(`OSRM ${res.code}`);
  return res.durations.map((row, i) =>
    row.map((d, j) => ({ seconds: d, meters: res.distances?.[i]?.[j] ?? null, source: "osrm" as const })),
  );
}

type GoogleMatrix = {
  status: string;
  rows: { elements: { status: string; duration?: { value: number }; distance?: { value: number } }[] }[];
};

async function googleTransit(sources: LatLng[], dests: LatLng[], departAt: number): Promise<Leg[][]> {
  const fmt = (ps: LatLng[]) => ps.map((p) => `${p.lat},${p.lng}`).join("|");
  const params = new URLSearchParams({
    origins: fmt(sources),
    destinations: fmt(dests),
    mode: "transit",
    departure_time: String(Math.max(Math.floor(departAt / 1000), Math.floor(Date.now() / 1000))),
    key: config.googleMapsKey,
  });
  const res = await fetchJson<GoogleMatrix>(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
  if (res.status !== "OK") throw new Error(`Google Distance Matrix ${res.status}`);
  return res.rows.map((r) =>
    r.elements.map((e) =>
      e.status === "OK"
        ? { seconds: e.duration!.value, meters: e.distance!.value, source: "google" as const }
        : { seconds: null, meters: null, source: "google" as const },
    ),
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Convert a raw engine leg into the leg for the origin's actual mode. */
function adapt(leg: Leg, mode: Mode, engine: Engine): Leg {
  if (mode === "transit" && engine === "car")
    return { seconds: leg.meters != null ? transitSecondsFromRoadMeters(leg.meters) : null, meters: leg.meters, source: "model" };
  return leg;
}

async function matrixForEngine(engine: Engine, sources: Origin[], dests: LatLng[], departAt: number): Promise<Leg[][]> {
  const out: Leg[][] = sources.map(() => new Array<Leg>(dests.length));
  const size = engine === "google-transit" ? Math.max(1, Math.floor(100 / sources.length)) : Math.max(1, 90 - sources.length);
  // Chunks run one after another; the request queue paces them.
  for (const c of chunk(
    dests.map((d, i) => ({ d, i })),
    size,
  )) {
    const ds = c.map((x) => x.d);
    let legs: Leg[][];
    try {
      legs = engine === "google-transit" ? await googleTransit(sources, ds, departAt) : await osrmTable(engine, sources, ds);
      legs = legs.map((row, i) => row.map((l) => adapt(l, sources[i].mode, engine)));
    } catch (err) {
      console.warn(`[where2] routing fallback (${engine}):`, (err as Error).message);
      legs = sources.map((s) => ds.map((d) => ({ ...modelSeconds(s, d, s.mode), source: "model" as const })));
    }
    c.forEach((x, j) => sources.forEach((_, i) => (out[i][x.i] = legs[i][j])));
  }
  return out;
}

/**
 * Travel times from each origin (with its own mode) to every destination.
 * Returns a map of originId -> legs aligned with `dests`.
 */
export async function travelMatrix(origins: Origin[], dests: LatLng[], departAt = Date.now()): Promise<Map<string, Leg[]>> {
  const result = new Map<string, Leg[]>();
  if (!origins.length || !dests.length) return result;

  const byEngine = new Map<Engine, Origin[]>();
  for (const o of origins) {
    const cached = dests.map((d) => matrixCache.get(key(o, d, o.mode)));
    if (cached.every(Boolean)) {
      result.set(o.id, cached as Leg[]);
      continue;
    }
    const e = engineFor(o.mode);
    byEngine.set(e, [...(byEngine.get(e) ?? []), o]);
  }

  await Promise.all(
    [...byEngine.entries()].map(async ([engine, os]) => {
      const legs = await matrixForEngine(engine, os, dests, departAt);
      os.forEach((o, i) => {
        result.set(o.id, legs[i]);
        legs[i].forEach((l, j) => l.seconds != null && l.source !== "model" && matrixCache.set(key(o, dests[j], o.mode), l));
        // Modelled transit on real road distances is still worth caching.
        legs[i].forEach((l, j) => o.mode === "transit" && l.source === "model" && l.meters != null && matrixCache.set(key(o, dests[j], o.mode), l));
      });
    }),
  );
  return result;
}

/** Single trip: used for live ETAs. */
export async function routeEta(from: LatLng, to: LatLng, mode: Mode, departAt = Date.now()): Promise<Leg> {
  const m = await travelMatrix([{ ...from, id: "x", mode }], [to], departAt);
  return m.get("x")![0];
}

/** Route geometry as [lat, lng] pairs (demo simulation and route previews). */
export async function routeGeometry(from: LatLng, to: LatLng, mode: Mode): Promise<{ path: LatLng[]; seconds: number; meters: number }> {
  const engine = engineFor(mode === "transit" ? "driving" : mode) as Exclude<Engine, "google-transit">;
  try {
    const url = `${OSRM_BASE[engine]}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await osrmGet<OsrmRoute>(url);
    const r = res.routes?.[0];
    if (!r?.geometry) throw new Error("no route");
    const seconds = mode === "transit" ? transitSecondsFromRoadMeters(r.distance) : r.duration;
    return { path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), seconds, meters: r.distance };
  } catch {
    const { seconds, meters } = modelSeconds(from, to, mode);
    return { path: [from, to], seconds, meters };
  }
}
