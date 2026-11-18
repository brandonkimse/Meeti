import "server-only";

/**
 * Runtime configuration. Geo services work out of the box with free, keyless
 * OpenStreetMap services. Set the optional keys to upgrade individual providers.
 */
export const config = {
  demoMode: process.env.MEETI_DEMO_MODE === "true",

  /** Identifies this deployment to OSM services, per their usage policies. */
  userAgent: process.env.MEETI_USER_AGENT || "Meeti/0.1 (hangout planner)",

  /** Address & place autocomplete (Photon is OSM-based and keyless). */
  photonUrl: process.env.MEETI_PHOTON_URL || "https://photon.komoot.io",
  /** Reverse geocoding. */
  nominatimUrl: process.env.MEETI_NOMINATIM_URL || "https://nominatim.openstreetmap.org",
  /** OSRM routing per profile. The FOSSGIS servers host foot, bike and car profiles. */
  osrm: {
    driving: process.env.MEETI_OSRM_CAR_URL || "https://routing.openstreetmap.de/routed-car",
    walking: process.env.MEETI_OSRM_FOOT_URL || "https://routing.openstreetmap.de/routed-foot",
    cycling: process.env.MEETI_OSRM_BIKE_URL || "https://routing.openstreetmap.de/routed-bike",
  },
  /** Backup car router used if the primary is rate-limited. Set to "" to disable. */
  osrmCarFallback: process.env.MEETI_OSRM_CAR_FALLBACK_URL ?? "https://router.project-osrm.org",

  /**
   * Optional: Google Maps Platform key. When present, Meeti uses Google for
   * real public-transit travel times (Distance Matrix) and for place photos and
   * ratings (Places API). Without it, transit times use a labelled estimate and
   * place data comes from OpenStreetMap.
   */
  googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || "",

  /** Shown in the privacy policy and terms: who runs Meeti and how to reach them. */
  legal: {
    operator: process.env.MEETI_OPERATOR_NAME || "",
    email: process.env.MEETI_CONTACT_EMAIL || "",
  },
};

export type ProviderStatus = {
  demoMode: boolean;
  transit: "google" | "estimate";
  places: "google" | "openstreetmap";
};

export function providerStatus(): ProviderStatus {
  return {
    demoMode: config.demoMode,
    transit: config.googleMapsKey ? "google" : "estimate",
    places: config.googleMapsKey ? "google" : "openstreetmap",
  };
}
