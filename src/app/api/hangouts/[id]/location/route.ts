import { requireUser } from "@/server/auth";
import { handle, lat, lng, num, readBody } from "@/server/http";
import { updateLocation } from "@/server/services/live";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  await updateLocation(u.id, (await params).id, {
    lat: lat(b.lat),
    lng: lng(b.lng),
    accuracy: b.accuracy != null ? num(b.accuracy, "Accuracy", { min: 0 }) : null,
  });
  return { ok: true };
});
