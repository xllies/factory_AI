import { NextResponse, type NextRequest } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";
import { entryToIcs } from "@/lib/ics";
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
 * Returns a single .ics file for one entry. The route handler matches
 * /api/calendar/event/<id>.ics — Next strips the .ics suffix into the param.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = rawId.endsWith(".ics") ? rawId.slice(0, -4) : rawId;

  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await db
    .from("recall_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = data as DbRow;
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

  const ics = entryToIcs(entry);
  if (!ics) {
    return NextResponse.json({ error: "Entry has no due date" }, { status: 400 });
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="recall-${id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
