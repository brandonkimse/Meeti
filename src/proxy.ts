import { NextResponse, type NextRequest } from "next/server";

const APP_PREFIXES = ["/home", "/groups", "/hangouts", "/profile"];

/** Fast cookie check; the (app) layout does the real session validation. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("w2_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/home/:path*", "/groups/:path*", "/hangouts/:path*", "/profile/:path*"] };
