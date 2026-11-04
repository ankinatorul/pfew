import { rootOAuthCallback, authRedirectOrigin } from "./lib/auth-redirect";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  const origin = authRedirectOrigin(
    request.url,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
  // Normalize an explicitly opened wildcard address before PKCE cookies are set.
  const browserHost = request.headers.get("host") || "";
  if (/^(?:0\.0\.0\.0|\[::\])(?::\d+)?$/.test(browserHost)) {
    const target = new URL(origin);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }
  const codes = request.nextUrl.searchParams.getAll("code");
  const callback =
    request.nextUrl.pathname === "/" && codes.length === 1
      ? rootOAuthCallback(codes[0])
      : null;
  if (callback) return NextResponse.redirect(new URL(callback, origin));
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const db = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Refresh token rotation happens before server components read the session.
  await db.auth.getUser();
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
