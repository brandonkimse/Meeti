import "server-only";
import type { Category, LatLng, PlaceCandidate } from "@/lib/types";
import { config } from "../config";
import { fetchJson, TtlCache } from "./util";

/**
 * Place search & geocoding.
 * - Default provider: Photon (OpenStreetMap data, keyless).
 * - With GOOGLE_MAPS_API_KEY: Google Places for nearby search (adds photos + ratings).
 */

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};
type PhotonResponse = { features: PhotonFeature[] };

/** OSM tags that make up each Meeti category. */
export const CATEGORY_TAGS: Record<Category, string[]> = {
  food: ["amenity:restaurant", "amenity:fast_food", "amenity:food_court"],
  cafe: ["amenity:cafe", "amenity:ice_cream", "shop:bakery"],
  activity: [
    "amenity:cinema",
    "leisure:bowling_alley",
    "leisure:amusement_arcade",
    "leisure:escape_game",
    "leisure:miniature_golf",
    "amenity:theatre",
    "tourism:museum",
    "tourism:gallery",
    "amenity:arts_centre",
  ],
  drinks: ["amenity:bar", "amenity:pub", "amenity:biergarten"],
  shopping: ["shop:mall", "shop:department_store", "amenity:marketplace"],
  park: ["leisure:park", "leisure:garden", "leisure:nature_reserve"],
};

const GOOGLE_TYPES: Record<Category, string[]> = {
  food: ["restaurant"],
  cafe: ["cafe", "bakery"],
  activity: ["bowling_alley", "movie_theater", "museum", "amusement_center", "art_gallery"],
  drinks: ["bar"],
  shopping: ["shopping_mall", "department_store", "market"],
  park: ["park"],
};

function categoryFor(key?: string, value?: string): Category | null {
  const tag = `${key}:${value}`;
  for (const [cat, tags] of Object.entries(CATEGORY_TAGS)) if (tags.includes(tag)) return cat as Category;
  return null;
}

function photonAddress(p: PhotonFeature["properties"]): string | null {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const area = p.locality || p.district || p.city;
  const parts = [street || null, area && area !== street ? area : null, p.city && p.city !== area ? p.city : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function photonToPlace(f: PhotonFeature): PlaceCandidate | null {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.city;
  if (!name) return null;
  return {
    externalId: `osm:${p.osm_type}${p.osm_id}`,
    name,
    address: photonAddress(p) ?? [p.city, p.state].filter(Boolean).join(", "),
    lat,
    lng,
    category: categoryFor(p.osm_key, p.osm_value),
    kind: p.osm_value ? p.osm_value.replace(/_/g, " ") : null,
    imageUrl: null,
    rating: null,
    ratingCount: null,
  };
}

const searchCache = new TtlCache<PlaceCandidate[]>(1000 * 60 * 10);
const nearbyCache = new TtlCache<PlaceCandidate[]>(1000 * 60 * 30);

/** Free-text place/address search, biased toward `near`. */
export async function searchPlaces(query: string, near?: LatLng | null): Promise<PlaceCandidate[]> {
  const qs = new URLSearchParams({ q: query, limit: "8", lang: "en" });
  if (near) {
    qs.set("lat", near.lat.toFixed(4));
    qs.set("lon", near.lng.toFixed(4));
  }
  const ck = qs.toString();
  const hit = searchCache.get(ck);
  if (hit) return hit;
  const res = await fetchJson<PhotonResponse>(`${config.photonUrl}/api/?${qs}`, {
    headers: { "User-Agent": config.userAgent },
  });
  const out = res.features.map(photonToPlace).filter((p): p is PlaceCandidate => !!p);
  searchCache.set(ck, out);
  return out;
}

type NominatimReverse = { name?: string; display_name?: string; address?: Record<string, string> };

/** Turn coordinates into a short human label like "Valencia St, Mission". */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const qs = new URLSearchParams({ format: "jsonv2", lat: String(p.lat), lon: String(p.lng), zoom: "17" });
    const res = await fetchJson<NominatimReverse>(`${config.nominatimUrl}/reverse?${qs}`, {
      headers: { "User-Agent": config.userAgent, "Accept-Language": "en" },
      timeoutMs: 6000,
    });
    const a = res.address ?? {};
    const street = a.road || a.pedestrian || a.footway;
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.city || a.town;
    const label = [street, area].filter(Boolean).join(", ");
    return label || res.display_name?.split(",").slice(0, 2).join(",") || null;
  } catch {
    return null;
  }
}

async function photonNearby(center: LatLng, radiusM: number, category: Category): Promise<PlaceCandidate[]> {
  const qs = new URLSearchParams({
    lat: center.lat.toFixed(5),
    lon: center.lng.toFixed(5),
    radius: (radiusM / 1000).toFixed(2),
    limit: "30",
    lang: "en",
  });
  for (const t of CATEGORY_TAGS[category]) qs.append("osm_tag", t);
  const res = await fetchJson<PhotonResponse>(`${config.photonUrl}/reverse?${qs}`, {
    headers: { "User-Agent": config.userAgent },
  });
  return res.features
    .map(photonToPlace)
    .filter((p): p is PlaceCandidate => !!p && !!p.name)
    .map((p) => ({ ...p, category }));
}

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  photos?: { name: string }[];
};

async function googleNearby(center: LatLng, radiusM: number, category: Category): Promise<PlaceCandidate[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googleMapsKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.shortFormattedAddress,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.photos",
    },
    body: JSON.stringify({
      includedTypes: GOOGLE_TYPES[category],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(radiusM, 50000) } },
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}`);
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map((g) => ({
    externalId: `google:${g.id}`,
    name: g.displayName?.text ?? "Unnamed place",
    address: g.shortFormattedAddress ?? g.formattedAddress ?? null,
    lat: g.location.latitude,
    lng: g.location.longitude,
    category,
    kind: g.primaryType?.replace(/_/g, " ") ?? null,
    // Photos are proxied so the API key never reaches the browser.
    imageUrl: g.photos?.[0] ? `/api/geo/photo?name=${encodeURIComponent(g.photos[0].name)}` : null,
    rating: g.rating ?? null,
    ratingCount: g.userRatingCount ?? null,
  }));
}

/** Real places of a category around a point. */
export async function nearbyPlaces(center: LatLng, radiusM: number, category: Category): Promise<PlaceCandidate[]> {
  const ck = `${category}:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${Math.round(radiusM / 100)}:${config.googleMapsKey ? "g" : "o"}`;
  const hit = nearbyCache.get(ck);
  if (hit) return hit;
  let out: PlaceCandidate[];
  if (config.googleMapsKey) {
    try {
      out = await googleNearby(center, radiusM, category);
    } catch (e) {
      console.warn("[meeti] Google Places failed, falling back to OSM:", (e as Error).message);
      out = await photonNearby(center, radiusM, category);
    }
  } else {
    out = await photonNearby(center, radiusM, category);
  }
  nearbyCache.set(ck, out);
  return out;
}

/* ---------- Popularity signals (OpenStreetMap via Photon, keyless) ---------- */

/** Everyday venues whose density tells a lively neighbourhood from an empty hillside. */
const BUSY_TAGS = ["amenity:restaurant", "amenity:cafe", "amenity:bar", "amenity:pub", "amenity:fast_food", "shop"];
/** Photon returns at most this many, so a count at the cap means "very busy". */
export const BUSY_CAP = 50;
const busyCache = new TtlCache<number>(1000 * 60 * 60 * 24);
const stationCache = new TtlCache<LatLng[]>(1000 * 60 * 60 * 24);

/** How many venues sit within ~500 m of a point (0 = empty, BUSY_CAP = city centre). */
export async function busyness(p: LatLng): Promise<number> {
  const ck = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  const hit = busyCache.get(ck);
  if (hit != null) return hit;
  const qs = new URLSearchParams({ lat: p.lat.toFixed(5), lon: p.lng.toFixed(5), radius: "0.5", limit: String(BUSY_CAP) });
  for (const t of BUSY_TAGS) qs.append("osm_tag", t);
  const res = await fetchJson<PhotonResponse>(`${config.photonUrl}/reverse?${qs}`, {
    headers: { "User-Agent": config.userAgent },
    timeoutMs: 6000,
  });
  const n = res.features.length;
  busyCache.set(ck, n);
  return n;
}

/** Train and subway stations near a point: natural, easy-to-reach meeting hubs. */
export async function nearbyStations(center: LatLng, radiusM: number, limit = 25): Promise<LatLng[]> {
  const ck = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${Math.round(radiusM / 500)}:${limit}`;
  const hit = stationCache.get(ck);
  if (hit) return hit;
  const qs = new URLSearchParams({
    lat: center.lat.toFixed(5),
    lon: center.lng.toFixed(5),
    radius: (Math.min(radiusM, 30000) / 1000).toFixed(2),
    limit: String(Math.min(50, limit * 2)),
    osm_tag: "railway:station",
  });
  const res = await fetchJson<PhotonResponse>(`${config.photonUrl}/reverse?${qs}`, {
    headers: { "User-Agent": config.userAgent },
    timeoutMs: 6000,
  });
  // Stations served by several lines appear once per line; keep one of each name.
  const seen = new Set<string>();
  const out: LatLng[] = [];
  for (const f of res.features) {
    const name = f.properties.name ?? `${f.geometry.coordinates}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
    if (out.length === limit) break;
  }
  stationCache.set(ck, out);
  return out;
}
