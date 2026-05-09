import { NextRequest, NextResponse } from "next/server";
import {
  getShoppingMemories,
  createShoppingMemory,
  deleteShoppingMemory,
  pinShoppingMemory,
} from "@/lib/shopping";

export async function GET() {
  const result = await getShoppingMemories();
  if (!result.ok) {
    if (result.code === "no_client") {
      return NextResponse.json({ memories: [], reason: "supabase_unconfigured" as const });
    }
    if (result.code === "no_user") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Could not load shopping memories", detail: result.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ memories: result.memories });
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

  const result = await createShoppingMemory(body);
  if (!result.ok) {
    if (result.code === "no_client") {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }
    if (result.code === "no_user") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to save memory", detail: result.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ memory: result.memory }, { status: 201 });
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
