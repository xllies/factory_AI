import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-server";

type MemoryBody = {
  profileId?: string;
  content?: string;
  category?: "goal" | "feeling" | "fact" | "todo";
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as MemoryBody;
  const profileId = body.profileId?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  const category = body.category ?? "fact";

  if (!profileId || !content) {
    return NextResponse.json({ error: "profileId and content are required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({
      stored: false,
      reason: "supabase credentials are not configured",
    });
  }

  const { error } = await supabase.from("memory_items").insert({
    profile_id: profileId,
    content,
    category,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stored: true });
}
