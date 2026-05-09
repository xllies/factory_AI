import { NextRequest, NextResponse } from "next/server";
import {
  getShoppingMemories,
  createShoppingMemory,
  deleteShoppingMemory,
  pinShoppingMemory,
} from "@/lib/shopping";

export async function GET() {
  const memories = await getShoppingMemories();
  return NextResponse.json({ memories });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    summary: string;
    sentiment?: "positive" | "negative" | "neutral";
    tags?: string[];
    retailer?: string | null;
    brand?: string | null;
    product?: string | null;
    color?: string | null;
    pinned?: boolean;
  };

  if (!body.summary?.trim()) {
    return NextResponse.json({ error: "summary is required" }, { status: 400 });
  }

  const memory = await createShoppingMemory(body);
  if (!memory) {
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
  return NextResponse.json({ memory }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; pinned: boolean };
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await pinShoppingMemory(body.id, body.pinned);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await deleteShoppingMemory(id);
  return NextResponse.json({ ok: true });
}
