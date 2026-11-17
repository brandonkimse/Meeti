import { MODES } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handle, oneOf, readBody } from "@/server/http";
import { setParticipation } from "@/server/services/hangouts";

export const PATCH = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  const b = await readBody(req);
  await setParticipation(u.id, (await params).id, {
    rsvp: b.rsvp ? oneOf(b.rsvp, "RSVP", ["going", "maybe", "declined"] as const) : undefined,
    mode: b.mode ? oneOf(b.mode, "Transport mode", MODES.map((m) => m.id)) : undefined,
  });
  return { ok: true };
});
