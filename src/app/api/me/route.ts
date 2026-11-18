import { requireUser } from "@/server/auth";
import { run } from "@/server/db";
import { HttpError } from "@/server/auth";
import { handle, imageDataUrl, readBody, str } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { deleteAccount } from "@/server/services/account";

export const GET = handle(async () => {
  const u = await requireUser();
  return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url };
});

export const PATCH = handle(async (req) => {
  const u = await requireUser();
  const b = await readBody(req);
  if (b.name !== undefined) await run("UPDATE profiles SET name = ? WHERE id = ?", str(b.name, "Name", { min: 1, max: 40 }), u.id);
  if (b.avatarUrl !== undefined) await run("UPDATE profiles SET avatar_url = ? WHERE id = ?", imageDataUrl(b.avatarUrl, "Photo"), u.id);
  return { ok: true };
});

/** Permanently delete your account. The body must say { confirm: "DELETE" }. */
export const DELETE = handle(async (req) => {
  const u = await requireUser();
  const b = await readBody(req);
  if (b.confirm !== "DELETE") throw new HttpError(400, 'Type "DELETE" to confirm.');
  await rateLimit("deleteAccount", u.id);
  await deleteAccount(u.id);
  return { ok: true };
});
