import { HttpError, requireUser } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { supabaseServer } from "@/server/supabase";

/** Set a new password for the signed-in account (used after a reset link). */
export const POST = handle(async (req) => {
  await requireUser();
  const b = await readBody(req);
  const password = str(b.password, "Password", { min: 8, max: 200 });
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) throw new HttpError(400, "That's your current password. Pick a new one.");
    throw new HttpError(400, error.message);
  }
  return { ok: true };
});
