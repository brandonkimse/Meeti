import { MODES } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handle, lat, lng, oneOf, readBody, str } from "@/server/http";
import { reverseGeocode } from "@/server/geo/places";
import { setOrigin } from "@/server/services/hangouts";

type Ctx = { params: Promise<{ id: string }> };

/** Set my starting point for this hangout (one-time GPS fix or a typed address). */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const u = await requireActor();
  const b = await readBody(req);
  const point = { lat: lat(b.lat), lng: lng(b.lng) };
  const source = oneOf(b.source, "Source", ["gps", "manual"] as const);
  let label = str(b.label, "Label", { optional: true, max: 120 }) || null;
  if (!label) label = (await reverseGeocode(point)) ?? "Pinned location";
  await setOrigin(u.id, (await params).id, {
    ...point,
    label,
    source,
    mode: b.mode ? oneOf(b.mode, "Transport mode", MODES.map((m) => m.id)) : null,
  });
  return { ok: true, label };
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const u = await requireActor();
  await setOrigin(u.id, (await params).id, null);
  return { ok: true };
});
