import { NextResponse, type NextRequest } from "next/server";
import { getSafeInternalPath } from "@/lib/auth-redirect";
import { getUserSupabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const next = getSafeInternalPath(searchParams.get("next"));

  const toLogin = (reason: "oauth" | "exchange" | "incomplete" | "config") => {
    const dest = new URL("/login", origin);
    dest.searchParams.set("error", reason);
    dest.searchParams.set("next", next);
    return NextResponse.redirect(dest);
  };

  if (oauthError) {
    return toLogin("oauth");
  }

  if (!code) {
    return toLogin("incomplete");
  }

  const supabase = await getUserSupabase();
  if (!supabase) {
    return toLogin("config");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return toLogin("exchange");
  }

  return NextResponse.redirect(new URL(next, origin));
}
