import { requireUser } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { background } from "@/server/background";
import { ensureDemoJourneys } from "@/server/services/demo";
import { finalize } from "@/server/services/hangouts";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const id = (await params).id;
  const b = await readBody(req);
  await finalize(u.id, id, str(b.suggestionId, "Option"));
  background(() => ensureDemoJourneys(id));
  return { ok: true };
});
