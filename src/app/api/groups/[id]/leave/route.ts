import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { leaveGroup } from "@/server/services/groups";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  await leaveGroup(u.id, (await params).id);
  return { ok: true };
});
