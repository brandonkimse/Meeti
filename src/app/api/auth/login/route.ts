import { claimGuest, HttpError } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { supabaseServer } from "@/server/supabase";
import { clientIp, rateLimit } from "@/server/ratelimit";

export const POST = handle(async (req) => {
  const b = await readBody(req);
  const email = str(b.email, "Email").toLowerCase();
  const password = str(b.password, "Password");
  await rateLimit("loginIp", clientIp(req), "Too many login attempts. Please wait a few minutes.");
  await rateLimit("loginEmail", email, "Too many login attempts for this account. Please wait a few minutes or reset your password.");
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) throw new HttpError(401, "Please confirm your email first. Check your inbox for the link.");
    throw new HttpError(401, "That email and password don't match.");
  }
  // Keep anything this browser did as a guest.
  if (data.user) await claimGuest(data.user.id);
  return { ok: true };
});
