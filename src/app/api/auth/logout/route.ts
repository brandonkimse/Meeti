import { handle } from "@/server/http";
import { supabaseServer } from "@/server/supabase";

export const POST = handle(async () => {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return { ok: true };
});
