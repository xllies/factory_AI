import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Middleware refreshes the Supabase auth cookie on every request and
 * redirects unauthenticated visitors to /login for protected routes.
 *
 * Public routes: /login, /auth/callback, /api/calendar.ics, /api/health
 * Everything else requires a session.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/api/calendar.ics",
  "/api/health",
  "/_next",
  "/favicon",
];

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p));

  // If Supabase isn't configured, do nothing — the app falls back to local-only mode.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", url.pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && url.pathname === "/login") {
    const redirect = url.clone();
    redirect.pathname = "/today";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
