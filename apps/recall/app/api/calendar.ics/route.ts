import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-server";
import { entriesToIcs } from "@/lib/ics";
import type { Entry } from "@/lib/types";

interface DbRow {
  id: string;
  type: "memory" | "action";
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
 * Public-but-unguessable iCalendar feed.
 *
 * Calendar apps (Google, Apple, Outlook) cannot do OAuth, so we authenticate
 * via a long random token stored per user in `recall_calendar_tokens`.
 * Subscribe URL example:
 *
 *   https://recall.example.com/api/calendar.ics?token=<token>
 *
 * Google Calendar polls this every ~12-24h and merges events into a calendar
 * the user can layer onto their main view.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const db = getServiceSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: tokenRow, error: tokenErr } = await db
    .from("recall_calendar_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId = tokenRow.user_id as string;

  const { data, error } = await db
    .from("recall_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "action")
    .not("due_at", "is", null)
    .order("due_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries: Entry[] = ((data ?? []) as DbRow[]).map((row) => ({
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
  }));

  const ics = entriesToIcs(entries);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
