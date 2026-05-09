import { NextRequest, NextResponse } from "next/server";
import { getShoppingProfile, upsertShoppingProfile } from "@/lib/shopping";
import type { ShoppingProfile } from "@/lib/types";

export async function GET() {
  const profile = await getShoppingProfile();
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Partial<ShoppingProfile>;
  const result = await upsertShoppingProfile(body);
  if (!result.ok) {
    if (result.code === "no_client") {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }
    if (result.code === "no_user") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to save profile", detail: result.message },
      { status: 500 },
    );
  }
  const updated = await getShoppingProfile();
  return NextResponse.json({ profile: updated });
}
