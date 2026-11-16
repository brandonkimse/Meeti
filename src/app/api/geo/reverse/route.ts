import { requireUser } from "@/server/auth";
import { handle, lat, lng } from "@/server/http";
import { reverseGeocode } from "@/server/geo/places";

export const GET = handle(async (req) => {
  await requireUser();
  const u = new URL(req.url);
  return { label: await reverseGeocode({ lat: lat(u.searchParams.get("lat")), lng: lng(u.searchParams.get("lng")) }) };
});
