import { requireUser } from "@/server/auth";
import { handle, imageDataUrl, readBody, str } from "@/server/http";
import { getGroup, updateGroup } from "@/server/services/groups";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const u = await requireUser();
  return getGroup(u.id, (await params).id);
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  updateGroup(u.id, (await params).id, {
    name: b.name !== undefined ? str(b.name, "Group name", { min: 1, max: 50 }) : undefined,
    description: b.description !== undefined ? str(b.description, "Description", { optional: true, max: 200 }) || null : undefined,
    imageUrl: b.imageUrl !== undefined ? imageDataUrl(b.imageUrl, "Group photo") : undefined,
    emoji: b.emoji !== undefined ? str(b.emoji, "Emoji", { optional: true, max: 16 }) || null : undefined,
  });
  return { ok: true };
});
