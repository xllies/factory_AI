import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-server";

type ProfileBody = {
  profileId?: string;
  fullName?: string;
  focusGoal?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ProfileBody;
  const profileId = body.profileId?.trim() ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const focusGoal = body.focusGoal?.trim() ?? "";

  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({
      stored: false,
      reason: "supabase credentials are not configured",
    });
  }

  const { error } = await supabase.from("profiles").upsert({
    id: profileId,
    full_name: fullName || null,
    focus_goal: focusGoal || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stored: true });
}
