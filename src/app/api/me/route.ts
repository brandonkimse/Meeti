import { requireUser } from "@/server/auth";
import { run } from "@/server/db";
import { handle, imageDataUrl, readBody, str } from "@/server/http";

export const GET = handle(async () => {
  const u = await requireUser();
  return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url };
});

export const PATCH = handle(async (req) => {
  const u = await requireUser();
  const b = await readBody(req);
  if (b.name !== undefined) await run("UPDATE users SET name = ? WHERE id = ?", str(b.name, "Name", { min: 1, max: 40 }), u.id);
  if (b.avatarUrl !== undefined) await run("UPDATE users SET avatar_url = ? WHERE id = ?", imageDataUrl(b.avatarUrl, "Photo"), u.id);
  return { ok: true };
});
