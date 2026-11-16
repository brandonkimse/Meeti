import { requireUser } from "@/server/auth";
import { handle, imageDataUrl, readBody, str } from "@/server/http";
import { createGroup } from "@/server/services/groups";

export const POST = handle(async (req) => {
  const u = await requireUser();
  const b = await readBody(req);
  const id = await createGroup(u.id, {
    name: str(b.name, "Group name", { min: 1, max: 50 }),
    description: str(b.description, "Description", { optional: true, max: 200 }) || null,
    imageUrl: imageDataUrl(b.imageUrl, "Group photo"),
    emoji: str(b.emoji, "Emoji", { optional: true, max: 16 }) || null,
  });
  return { id };
});
