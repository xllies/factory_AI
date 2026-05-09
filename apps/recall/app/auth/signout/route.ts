import { NextResponse, type NextRequest } from "next/server";
import { getUserSupabase } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await getUserSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
}
