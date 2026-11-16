import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { removeMember } from "@/server/services/groups";

export const DELETE = handle<{ params: Promise<{ id: string; userId: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  const p = await params;
  removeMember(u.id, p.id, p.userId);
  return { ok: true };
});
