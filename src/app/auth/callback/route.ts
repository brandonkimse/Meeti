import { NextResponse } from "next/server";
import { claimGuest } from "@/server/auth";
import { supabaseServer } from "@/server/supabase";

/** Landing point for Supabase email links (sign-up confirmation). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/home";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";
  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The confirmation link usually opens in the same browser the guest used.
      if (data.user) await claimGuest(data.user.id);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
