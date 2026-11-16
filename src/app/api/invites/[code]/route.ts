import { getCurrentUser, requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { joinByCode, membership, previewInvite } from "@/server/services/groups";

type Ctx = { params: Promise<{ code: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const g = await previewInvite((await params).code);
  const u = await getCurrentUser();
  return { ...g, alreadyMember: !!(u && (await membership(u.id, g.id))), signedIn: !!u };
});

export const POST = handle<Ctx>(async (_req, { params }) => {
  const u = await requireUser();
  return { groupId: await joinByCode(u.id, (await params).code) };
});
