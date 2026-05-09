import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { getUserSupabase } from "@/lib/supabase-server";

function publicOrigin(request: Request): string {
  if (env.APP_BASE_URL) {
    return env.APP_BASE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

/**
 * Returns the user's iCalendar feed URL, creating a token row on first call.
 * Paste this URL into Google Calendar → "Other calendars" → "From URL" to
 * subscribe with auto-sync.
 */
export async function GET(request: Request) {
  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: existing } = await db
    .from("recall_calendar_tokens")
    .select("token")
    .eq("user_id", user.id)
    .maybeSingle();

  let token = existing?.token as string | undefined;
  if (!token) {
    token = randomBytes(24).toString("hex");
    const { error } = await db
      .from("recall_calendar_tokens")
      .insert({ user_id: user.id, token });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const feedUrl = `${publicOrigin(request)}/api/calendar.ics?token=${token}`;

  return NextResponse.json({ feedUrl, token });
}

/** Rotate the token (invalidates the old subscription URL). */
export async function POST() {
  const db = await getUserSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const token = randomBytes(24).toString("hex");
  const { error } = await db
    .from("recall_calendar_tokens")
    .upsert({ user_id: user.id, token }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token, rotated: true });
}
