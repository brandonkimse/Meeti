import { requireUser } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { saveAsGroup } from "@/server/services/hangouts";

/** Save a group-less plan's crew as a group for next time. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  const groupId = await saveAsGroup(
    u.id,
    (await params).id,
    str(b.name, "Group name", { min: 1, max: 50 }),
    str(b.emoji, "Emoji", { optional: true, max: 16 }) || null,
  );
  return { groupId };
});
