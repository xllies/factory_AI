import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import type { ClassifyResult } from "@/lib/types";
import { parseDueAt } from "@/lib/datetime";
import { detectShoppingIntent, parseShoppingIntent } from "@/lib/shopping-intent";

interface ClassifyRequest {
  text?: string;
  /** IANA timezone, e.g. "Europe/Athens". Sent by the client so dates resolve correctly. */
  timezone?: string;
}

const SYSTEM = `You are a personal capture assistant. Given raw text (spoken or typed), extract structured data.

Classify the input as exactly one type:
- "memory": something to remember (a fact, feeling, person, event, preference, observation)
- "action": something to do (task, reminder, goal, errand, appointment, meeting)
- "shopping": a request to find or buy a specific product — clothing, shoes, accessories, or any item to purchase

Return ONLY valid JSON with this exact shape:
{
  "type": "memory" | "action" | "shopping",
  "summary": string,
  "tags": string[],
  "dueAt": string | null,
  "location": string | null,
  "shopping": {
    "garmentClass": "tops" | "bottoms" | "shoes" | "dresses" | "outerwear" | "accessories" | "underwear" | string,
    "size": string | null,
    "color": string | null,
    "budget": number | null,
    "currency": string,
    "retailer": string | null
  } | null
}

Rules:
- summary: clean, concise restatement (1-2 sentences, third-person if memory, imperative if action/shopping)
- tags: 1-3 lowercase single-word tags relevant to the content
- dueAt: ISO 8601 datetime in the user's timezone if a time was mentioned, null otherwise
- location: short place name if explicitly mentioned, null otherwise
- shopping: populate ONLY when type is "shopping". Include garmentClass (the category), size if mentioned, color if mentioned, budget number if mentioned (strip currency symbol), currency code (EUR/USD/GBP/SEK, default EUR), retailer if a specific store was named (e.g. "asket", "zalando"). Set to null when type is not "shopping".
- For "action" with no explicit time, dueAt is null.
- For "memory", dueAt is almost always null.
- When in doubt between memory and action, prefer "memory". When shopping intent is clear (buy, find, get, shop for), use "shopping".`;

function heuristicClassify(text: string, timezone: string): ClassifyResult {
  if (detectShoppingIntent(text)) {
    const shopping = parseShoppingIntent(text);
    return {
      type: "shopping",
      summary: text.trim(),
      tags: ["shopping", shopping.garmentClass].filter(Boolean).slice(0, 3),
      dueAt: null,
      location: null,
      shopping,
    };
  }

  const actionWords =
    /\b(do|call|send|remind|schedule|buy|fix|check|finish|email|text|book|pay|clean|write|read|make|pick up|follow up|research|review|prepare|update|contact|order|return|cancel|confirm|set up|look into|meet|meeting|appointment|deadline)\b/i;

  const type: ClassifyResult["type"] = actionWords.test(text) ? "action" : "memory";
  const due = parseDueAt(text, { now: new Date(), timezone });

  return {
    type,
    summary: text.trim(),
    tags: [],
    dueAt: due ? due.toISOString() : null,
    location: null,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ClassifyRequest;
  const text = body.text?.trim();
  const timezone = body.timezone || "UTC";

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(heuristicClassify(text, timezone));
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const now = new Date();
    const userMessage = `User timezone: ${timezone}
Current local time: ${now.toLocaleString("en-US", { timeZone: timezone })}
Current ISO time: ${now.toISOString()}

Input:
"""
${text}
"""`;

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ClassifyResult> & { shopping?: Record<string, unknown> | null };

    const type: ClassifyResult["type"] =
      parsed.type === "shopping" ? "shopping"
      : parsed.type === "action" ? "action"
      : "memory";

    const result: ClassifyResult = {
      type,
      summary: parsed.summary?.trim() || text.trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      dueAt: typeof parsed.dueAt === "string" ? parsed.dueAt : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
    };

    if (type === "shopping" && parsed.shopping && typeof parsed.shopping === "object") {
      const s = parsed.shopping;
      result.shopping = {
        garmentClass: typeof s.garmentClass === "string" ? s.garmentClass : "tops",
        size: typeof s.size === "string" ? s.size : null,
        color: typeof s.color === "string" ? s.color : null,
        budget: typeof s.budget === "number" ? s.budget : null,
        currency: typeof s.currency === "string" ? s.currency : "EUR",
        retailer: typeof s.retailer === "string" ? s.retailer : null,
      };
    }

    // Sanity-check the dueAt - if the model returned something unparseable, fall back to heuristic
    if (result.dueAt && Number.isNaN(new Date(result.dueAt).getTime())) {
      const heur = parseDueAt(text, { now, timezone });
      result.dueAt = heur ? heur.toISOString() : null;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(heuristicClassify(text, timezone));
  }
}
