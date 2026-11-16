import { CATEGORIES } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { handle, oneOf, readBody } from "@/server/http";
import { generateRecommendations } from "@/server/services/hangouts";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  return generateRecommendations(u.id, (await params).id, oneOf(b.category, "Category", CATEGORIES.map((c) => c.id)));
});
