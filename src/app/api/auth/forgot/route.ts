import { HttpError } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { supabaseServer } from "@/server/supabase";

/** Email a password-reset link. Always answers the same way, so it never reveals who has an account. */
export const POST = handle(async (req) => {
  const b = await readBody(req);
  const email = str(b.email, "Email", { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  await rateLimit("resetIp", clientIp(req));
  await rateLimit("resetEmail", email, "We've already sent a few reset emails to this address. Check your inbox (and spam), or try again in an hour.");

  const origin = new URL(req.url).origin;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message))
      throw new HttpError(429, "Too many emails are going out right now. Please try again in a few minutes.");
    console.warn("[meeti] password reset email failed:", error.message);
  }
  return { ok: true };
});
