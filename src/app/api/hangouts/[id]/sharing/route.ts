import { requireActor } from "@/server/auth";
import { handle, oneOf, readBody } from "@/server/http";
import { setSharingStatus, startSharing } from "@/server/services/live";

/** Explicit, per-hangout consent controls for live location. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  const id = (await params).id;
  const b = await readBody(req);
  const action = oneOf(b.action, "Action", ["start", "pause", "resume", "stop"] as const);
  if (action === "start") await startSharing(u.id, id);
  else await setSharingStatus(u.id, id, action === "pause" ? "paused" : action === "resume" ? "active" : "stopped");
  return { ok: true };
});
