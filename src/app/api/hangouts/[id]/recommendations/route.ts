import { CATEGORIES } from "@/lib/types";
import { requireActor } from "@/server/auth";
import { handle, oneOf, readBody } from "@/server/http";
import { generateRecommendations } from "@/server/services/hangouts";
import { rateLimit } from "@/server/ratelimit";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireActor();
  await rateLimit("recsUser", u.id, "You've refreshed picks a lot. Please wait a bit before trying again.");
  await rateLimit("recsGlobal", "all", "Lots of people are finding spots right now. Please try again in a minute.");
  const b = await readBody(req);
  return generateRecommendations(u.id, (await params).id, oneOf(b.category, "Category", CATEGORIES.map((c) => c.id)));
});
