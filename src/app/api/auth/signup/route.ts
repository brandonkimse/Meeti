import { createSession, createUser, HttpError } from "@/server/auth";
import { one } from "@/server/db";
import { handle, readBody, str } from "@/server/http";

export const POST = handle(async (req) => {
  const b = await readBody(req);
  const name = str(b.name, "Name", { min: 1, max: 40 });
  const email = str(b.email, "Email", { max: 120 }).toLowerCase();
  const password = str(b.password, "Password", { min: 8, max: 200 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (one("SELECT 1 FROM users WHERE email = ?", email)) throw new HttpError(409, "An account with that email already exists.");
  const id = createUser({ email, name, password });
  await createSession(id);
  return { ok: true };
});
