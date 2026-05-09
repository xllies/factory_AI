import { NextRequest, NextResponse } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";
import type { Entry, EntrySource } from "@/lib/types";

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
  source: EntrySource | null;
  created_at: string;
}

function rowToEntry(row: DbRow): Entry {
  return {
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
}

export async function GET() {
  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ entries: [], reason: "Supabase not configured" });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await db
    .from("recall_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = ((data ?? []) as DbRow[]).map(rowToEntry);
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Entry>;
  const { type, raw, summary, tags, dueAt, remindAt, location, source } = body;

  if (!type || !raw || !summary) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ stored: false, reason: "Supabase not configured" });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const insert = {
    user_id: user.id,
    type,
    raw,
    summary,
    tags: tags ?? [],
    done: false,
    due_at: dueAt ?? null,
    remind_at: remindAt ?? dueAt ?? null,
    location: location ?? null,
    source: source ?? "voice",
  };

  const { data, error } = await db
    .from("recall_entries")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ stored: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ stored: true, entry: rowToEntry(data as DbRow) });
}

interface PatchBody {
  id: string;
  done?: boolean;
  dueAt?: string | null;
  remindAt?: string | null;
  notifiedAt?: string | null;
  summary?: string;
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as PatchBody;
  const { id, done, dueAt, remindAt, notifiedAt, summary } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ updated: false, reason: "Supabase not configured" });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const update: Record<string, unknown> = {};
  if (typeof done === "boolean") update.done = done;
  if (dueAt !== undefined) update.due_at = dueAt;
  if (remindAt !== undefined) update.remind_at = remindAt;
  if (notifiedAt !== undefined) update.notified_at = notifiedAt;
  if (typeof summary === "string") update.summary = summary;

  const { error } = await db
    .from("recall_entries")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ updated: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ deleted: false, reason: "Supabase not configured" });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await db
    .from("recall_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ deleted: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
