import { CATEGORIES } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handle, oneOf, readBody } from "@/server/http";
import { generateRecommendations } from "@/server/services/hangouts";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  const b = await readBody(req);
  return generateRecommendations(u.id, (await params).id, oneOf(b.category, "Category", CATEGORIES.map((c) => c.id)));
});
