import { CATEGORIES, type PlaceCandidate } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handle, imageDataUrl, lat, lng, num, oneOf, readBody, str } from "@/server/http";
import { demoReact } from "@/server/services/demo";
import { addSuggestion } from "@/server/services/hangouts";
import { rateLimit } from "@/server/ratelimit";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  await rateLimit("suggestUser", u.id);
  const id = (await params).id;
  const b = await readBody(req);
  const place: PlaceCandidate = {
    externalId: str(b.externalId, "Place id", { optional: true, max: 200 }) || `pin:${b.lat},${b.lng}`,
    name: str(b.name, "Place name", { min: 1, max: 120 }),
    address: str(b.address, "Address", { optional: true, max: 200 }) || null,
    lat: lat(b.lat),
    lng: lng(b.lng),
    category: b.category ? oneOf(b.category, "Category", CATEGORIES.map((c) => c.id)) : null,
    kind: null,
    imageUrl: typeof b.imageUrl === "string" && b.imageUrl.startsWith("/api/geo/photo") ? b.imageUrl : imageDataUrl(b.imageUrl, "Image"),
    rating: b.rating != null ? num(b.rating, "Rating", { min: 0, max: 5 }) : null,
    ratingCount: b.ratingCount != null ? num(b.ratingCount, "Rating count", { min: 0 }) : null,
  };
  const source = b.source === "meeti" ? "meeti" : "member";
  const sid = await addSuggestion(u.id, id, place, source);
  demoReact(id);
  return { id: sid };
});
