import { claimGuest, HttpError } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { supabaseServer } from "@/server/supabase";

export const POST = handle(async (req) => {
  const b = await readBody(req);
  const name = str(b.name, "Name", { min: 1, max: 40 });
  const email = str(b.email, "Email", { max: 120 }).toLowerCase();
  const password = str(b.password, "Password", { min: 8, max: 200 });
  const next = typeof b.next === "string" && b.next.startsWith("/") && !b.next.startsWith("//") ? b.next : "/home";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");

  const origin = new URL(req.url).origin;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) throw new HttpError(400, error.message);
  // With email confirmation on (Supabase's default), there's no session until the link is clicked.
  if (data.session && data.user) await claimGuest(data.user.id);
  return { ok: true, needsConfirmation: !data.session };
});
