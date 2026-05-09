import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    services: {
      openai: Boolean(env.OPENAI_API_KEY),
      supabase: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
