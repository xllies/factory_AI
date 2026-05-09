import { NextResponse } from "next/server";
import { googleCalendarOAuthConfigured } from "@/lib/google-calendar-oauth-state";
import { getUserSupabase } from "@/lib/supabase-server";

/**
 * Connection status + disconnect Google Calendar OAuth.
 *
 * GET  → `{ configured, connected, email? }`
 * DELETE → remove stored refresh token
 */
export async function GET() {
  const configured = googleCalendarOAuthConfigured();
  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false });
  }

  const { data } = await db
    .from("recall_google_calendar")
    .select("email")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: true,
    connected: Boolean(data),
    email: (data?.email as string | undefined) ?? undefined,
  });
}

export async function DELETE() {
  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await db.from("recall_google_calendar").delete().eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
