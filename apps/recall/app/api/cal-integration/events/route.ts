import { CAL_INTEGRATION_PATH } from "@/lib/cal-integration-routes";
import { NextResponse, type NextRequest } from "next/server";
import { googleCalendarOAuthConfigured } from "@/lib/google-calendar-oauth-state";
import { insertRecallEntryIntoGoogleCalendar } from "@/lib/google-calendar-server";
import type { Entry } from "@/lib/types";
import { getUserSupabase } from "@/lib/supabase-server";

interface DbRow {
  id: string;
  type: Entry["type"];
  raw: string;
  summary: string;
  tags: string[] | null;
  done: boolean | null;
  due_at: string | null;
  remind_at: string | null;
  notified_at: string | null;
  location: string | null;
  source: Entry["source"] | null;
  created_at: string;
}

/**
 * Inserts one Recall reminder into the user's primary Google Calendar
 * (`calendar.events.insert`). Requires OAuth connect in Settings.
 */
export async function POST(req: NextRequest) {
  if (!googleCalendarOAuthConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Server has no Google Calendar OAuth credentials." },
      { status: 501 },
    );
  }

  let body: { entryId?: string };
  try {
    body = (await req.json()) as { entryId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const entryId = body.entryId;
  if (!entryId || typeof entryId !== "string") {
    return NextResponse.json({ error: "missing_entry_id" }, { status: 400 });
  }

  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: oauthRow } = await db
    .from("recall_google_calendar")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!oauthRow?.refresh_token) {
    return NextResponse.json(
      {
        error: "not_connected",
        message: "Connect Google Calendar in Settings first.",
        connectPath: `${CAL_INTEGRATION_PATH}/auth`,
      },
      { status: 428 },
    );
  }

  const [{ data: entryRow, error: entryErr }, { data: profile }] = await Promise.all([
    db
      .from("recall_entries")
      .select("*")
      .eq("id", entryId)
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("recall_profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (entryErr || !entryRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = entryRow as DbRow;
  const entry: Entry = {
    id: row.id,
    type: row.type,
    raw: row.raw,
    summary: row.summary,
    tags: row.tags ?? [],
    done: row.done ?? false,
    dueAt: row.due_at,
    remindAt: row.remind_at,
    notifiedAt: row.notified_at,
    location: row.location,
    source: row.source ?? "voice",
    createdAt: row.created_at,
  };

  if (!entry.dueAt) {
    return NextResponse.json({ error: "no_due_date" }, { status: 400 });
  }

  const timeZone = typeof profile?.timezone === "string" && profile.timezone.length > 0
    ? profile.timezone
    : "UTC";

  try {
    const created = await insertRecallEntryIntoGoogleCalendar(
      oauthRow.refresh_token as string,
      entry,
      timeZone,
    );
    return NextResponse.json({
      ok: true,
      eventId: created.id,
      htmlLink: created.htmlLink ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "google_api", message }, { status: 502 });
  }
}
