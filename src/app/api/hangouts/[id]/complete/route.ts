import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { complete } from "@/server/services/hangouts";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  await complete(u.id, (await params).id);
  return { ok: true };
});
