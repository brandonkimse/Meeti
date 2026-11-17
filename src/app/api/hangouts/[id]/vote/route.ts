import { requireActor } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { demoReact } from "@/server/services/demo";
import { vote } from "@/server/services/hangouts";

export const PUT = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  const id = (await params).id;
  const b = await readBody(req);
  await vote(u.id, id, b.suggestionId ? str(b.suggestionId, "Option") : null);
  demoReact(id);
  return { ok: true };
});
