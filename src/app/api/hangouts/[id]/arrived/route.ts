import { requireActor } from "@/server/auth";
import { handle } from "@/server/http";
import { markArrived } from "@/server/services/live";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireActor();
  await markArrived(u.id, (await params).id);
  return { ok: true };
});
