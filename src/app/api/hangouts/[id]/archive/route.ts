import { requireUser } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { setArchived } from "@/server/services/hangouts";

type Ctx = { params: Promise<{ id: string }> };

/** POST { archived: boolean }: archive or restore a past hangout for yourself. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  await setArchived(u.id, (await params).id, b.archived !== false);
  return { ok: true };
});
