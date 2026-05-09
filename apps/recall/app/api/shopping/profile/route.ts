import { NextRequest, NextResponse } from "next/server";
import { getShoppingProfile, upsertShoppingProfile } from "@/lib/shopping";
import type { ShoppingProfile } from "@/lib/types";

export async function GET() {
  const profile = await getShoppingProfile();
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Partial<ShoppingProfile>;
  await upsertShoppingProfile(body);
  const updated = await getShoppingProfile();
  return NextResponse.json({ profile: updated });
}
