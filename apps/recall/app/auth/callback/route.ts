import { NextResponse, type NextRequest } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";

/**
 * Supabase Auth redirects users here after clicking a magic link or
 * completing OAuth. We exchange the code for a session, set the cookie,
 * then bounce them to /today (or whatever ?next= they were trying to reach).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const supabase = await getUserSupabase();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
