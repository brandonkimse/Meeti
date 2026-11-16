import { HttpError, requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { removeMember } from "@/server/services/groups";

export const DELETE = handle<{ params: Promise<{ id: string; userId: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  const p = await params;
  if (!/^[0-9a-f-]{36}$/i.test(p.userId)) throw new HttpError(404, "That person isn't in this group.");
  await removeMember(u.id, p.id, p.userId);
  return { ok: true };
});
