import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/** Supabase client bound to the current request's auth cookies. */
export async function supabaseServer(): Promise<SupabaseClient> {
  assertSupabaseEnv();
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; the proxy refreshes them.
        }
      },
    },
  });
}

/** Service-role client for admin tasks (demo accounts). Never expose to the browser. */
export function supabaseAdmin(): SupabaseClient {
  assertSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. It's needed for demo mode.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
