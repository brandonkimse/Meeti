import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { regenerateInvite } from "@/server/services/groups";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  return { inviteCode: await regenerateInvite(u.id, (await params).id) };
});
