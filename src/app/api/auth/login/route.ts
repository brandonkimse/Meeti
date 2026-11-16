import { createSession, HttpError, verifyPassword } from "@/server/auth";
import { one } from "@/server/db";
import { handle, readBody, str } from "@/server/http";

export const POST = handle(async (req) => {
  const b = await readBody(req);
  const email = str(b.email, "Email").toLowerCase();
  const password = str(b.password, "Password");
  const u = one<{ id: string; password_hash: string | null }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  if (!u || !verifyPassword(password, u.password_hash)) throw new HttpError(401, "That email and password don't match.");
  await createSession(u.id);
  return { ok: true };
});
