import { requireActor } from "@/server/auth";
import { handle, lat, lng } from "@/server/http";
import { reverseGeocode } from "@/server/geo/places";
import { rateLimit } from "@/server/ratelimit";

export const GET = handle(async (req) => {
  const actor = await requireActor();
  await rateLimit("reverseUser", actor.id);
  const u = new URL(req.url);
  return { label: await reverseGeocode({ lat: lat(u.searchParams.get("lat")), lng: lng(u.searchParams.get("lng")) }) };
});
