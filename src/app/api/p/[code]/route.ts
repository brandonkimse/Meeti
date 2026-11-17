import { getActor } from "@/server/auth";
import { handle } from "@/server/http";
import { previewByShareCode } from "@/server/services/hangouts";

/** Public preview of a plan from its share link. */
export const GET = handle<{ params: Promise<{ code: string }> }>(async (_req, { params }) => {
  const actor = await getActor();
  const preview = await previewByShareCode((await params).code, actor?.id ?? null);
  return { ...preview, me: actor ? { id: actor.id, name: actor.name, isGuest: !!actor.is_guest } : null };
});
