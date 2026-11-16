import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { searchPlaces } from "@/server/geo/places";

export const GET = handle(async (req) => {
  await requireUser();
  const u = new URL(req.url);
  const query = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2) return { results: [] };
  const la = Number(u.searchParams.get("lat"));
  const ln = Number(u.searchParams.get("lng"));
  const near = Number.isFinite(la) && Number.isFinite(ln) && (la || ln) ? { lat: la, lng: ln } : null;
  try {
    return { results: await searchPlaces(query, near) };
  } catch {
    return Response.json({ error: "Search is unavailable right now.", results: [] }, { status: 502 });
  }
});
