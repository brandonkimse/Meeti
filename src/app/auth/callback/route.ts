import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { claimGuest } from "@/server/auth";
import { supabaseServer } from "@/server/supabase";

/**
 * Landing point for Supabase email links (sign-up confirmation). Handles both:
 * - `?token_hash=…&type=…`: works in any browser or device (recommended
 *   email template, see README).
 * - `?code=…`: the default PKCE link; only works in the browser that signed up.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextParam = url.searchParams.get("next") ?? "/home";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code || tokenHash) {
    const supabase = await supabaseServer();
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? "email" })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (!error && data.user) {
      // Keep anything this browser did as a guest.
      await claimGuest(data.user.id);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
