import { getCurrentUser, requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { joinByCode, membership, previewInvite } from "@/server/services/groups";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const g = previewInvite((await params).code);
  const u = await getCurrentUser();
  return { ...g, alreadyMember: !!(u && membership(u.id, g.id)), signedIn: !!u };
});

export const POST = handle<Ctx>(async (_req, { params }) => {
  const u = await requireUser();
  return { groupId: joinByCode(u.id, (await params).code) };
});
