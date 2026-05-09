import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ai-bestie-mvp",
    timestamp: new Date().toISOString(),
  });
}
