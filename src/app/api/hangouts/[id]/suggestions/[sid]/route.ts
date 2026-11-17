import { requireActor } from "@/server/auth";
import { handle } from "@/server/http";
import { removeSuggestion } from "@/server/services/hangouts";

export const DELETE = handle<{ params: Promise<{ id: string; sid: string }> }>(async (_req, { params }) => {
  const u = await requireActor();
  const p = await params;
  await removeSuggestion(u.id, p.id, p.sid);
  return { ok: true };
});
