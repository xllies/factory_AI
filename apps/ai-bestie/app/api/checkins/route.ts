import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-server";

type CheckinBody = {
  profileId?: string;
  moodScore?: number;
  note?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CheckinBody;
  const profileId = body.profileId?.trim() ?? "";
  const note = body.note?.trim() ?? "";
  const moodScore = body.moodScore ?? 3;

  if (!profileId || !note) {
    return NextResponse.json({ error: "profileId and note are required" }, { status: 400 });
  }
  if (moodScore < 1 || moodScore > 5) {
    return NextResponse.json({ error: "moodScore must be between 1 and 5" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({
      stored: false,
      reason: "supabase credentials are not configured",
    });
  }

  const { error } = await supabase.from("checkins").insert({
    profile_id: profileId,
    mood_score: moodScore,
    note,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stored: true });
}
