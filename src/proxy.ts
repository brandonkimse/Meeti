import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const APP_PREFIXES = ["/home", "/groups", "/hangouts", "/profile", "/plan"];

/**
 * Refreshes the Supabase auth session on every request (keeps cookies fresh),
 * and sends signed-out visitors of app pages to the login screen.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: fetchWithTimeout(8_000) },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  // Verifies the login token locally (and refreshes it when it's about to expire).
  // If Supabase is unreachable, carry on; the page itself checks the session again.
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const signedIn = !!data?.claims?.sub;

  const { pathname, search } = req.nextUrl;
  if (!signedIn && APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const c of res.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return res;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
