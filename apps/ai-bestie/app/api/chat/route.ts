import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { memoryContext, summarizeReply } from "@/lib/memory";
import type { MemoryItem } from "@/lib/types";

type ChatBody = {
  message?: string;
  memories?: MemoryItem[];
};

function looksHighRisk(text: string): boolean {
  const value = text.toLowerCase();
  return ["suicide", "kill myself", "self-harm", "hurt myself"].some((term) => value.includes(term));
}

function extractOpenAIText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const maybe = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (typeof maybe.output_text === "string" && maybe.output_text.trim()) {
    return maybe.output_text.trim();
  }

  const nested = maybe.output?.[0]?.content?.[0]?.text;
  if (typeof nested === "string" && nested.trim()) {
    return nested.trim();
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatBody;
  const message = body.message?.trim() ?? "";
  const memories = body.memories ?? [];

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (looksHighRisk(message)) {
    return NextResponse.json({
      reply:
        "I'm really glad you shared this. I can't help with crisis support directly, but you deserve immediate human support. If you might act on these thoughts, call emergency services now. You can also contact a local crisis line right away.",
      safetyMode: "resource-priority",
      usedModel: false,
    });
  }

  const prompt = [
    "You are AI Bestie, a supportive non-clinical companion for young professionals.",
    "Keep responses warm, short (3-6 sentences), practical, and never claim medical authority.",
    memoryContext(memories),
    `User message: ${message}`,
  ].join("\n\n");

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({
      reply: summarizeReply(message),
      safetyMode: "normal",
      usedModel: false,
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        {
          reply: summarizeReply(message),
          warning: `Model fallback used. Upstream error: ${details.slice(0, 220)}`,
          usedModel: false,
        },
        { status: 200 },
      );
    }

    const data = (await response.json()) as unknown;
    const extracted = extractOpenAIText(data);

    return NextResponse.json({
      reply: extracted ?? summarizeReply(message),
      usedModel: Boolean(extracted),
      safetyMode: "normal",
    });
  } catch {
    return NextResponse.json({
      reply: summarizeReply(message),
      warning: "Model call failed; fallback response returned.",
      usedModel: false,
    });
  }
}
