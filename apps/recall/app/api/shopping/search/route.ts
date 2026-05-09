/**
 * GPT-powered shopping search.
 * Accepts a ShoppingIntent + optional ShoppingProfile and returns ranked candidates.
 * **Outbound links are always canonical retailer search URLs** built server-side from the
 * user's country/currency — the model may hallucinate product pages; we ignore its `url` field.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import type { ShoppingIntent, ShoppingProfile, ShoppingCandidate } from "@/lib/types";
import { applyCanonicalRetailerUrls } from "@/lib/shopping-retailer-urls";

interface SearchRequest {
  intent: ShoppingIntent;
  profile?: Partial<ShoppingProfile>;
  memories?: Array<{ summary: string; sentiment: string; retailer?: string | null }>;
}

const SEARCH_SYSTEM = `You are a personal shopping assistant. Given a shopping intent and the user's style profile, generate 4-6 specific product *ideas* (not live inventory).

For each candidate, provide:
- title: specific product name (e.g. "Classic Oxford Shirt", "Slim Fit Chinos")
- brand: brand name
- retailer: one of "asket", "zalando", "zara", "uniqlo", "hm", or "asos"
- price: estimated price as a number (null if unknown)
- currency: 3-letter code matching the user's currency
- size: recommended size based on the user's profile (null if no profile data)
- color: specific color recommendation
- confidence: 0.0–1.0 score for how well this matches the intent

Do NOT invent product URLs, product IDs, or paths. Omit "url" entirely (the API adds retailer search links).

Rules:
- Prefer "asket" for minimalist, sustainable basics (t-shirts, shirts, trousers, underwear). Asket does not carry all categories (e.g. limited footwear) — still suggest when it fits the brand.
- Prefer "zalando" for wider variety, shoes, trend pieces.
- If the user specified a retailer, only return candidates from that retailer.
- Apply negative shopping memories: if the user had a bad experience with a brand/color/retailer, reduce confidence.
- Apply the budget ceiling — exclude items above the budget.
- Return ONLY valid JSON: { "candidates": [...] }`;

function buildSearchPrompt(req: SearchRequest): string {
  const { intent, profile, memories } = req;
  const parts: string[] = [];

  parts.push(`Shopping intent:
- garment: ${intent.garmentClass}
- size requested: ${intent.size ?? "not specified"}
- color: ${intent.color ?? "any"}
- budget: ${intent.budget ? `${intent.budget} ${intent.currency}` : "no limit"}
- retailer preference: ${intent.retailer ?? "any"}`);

  if (profile) {
    parts.push(`\nUser profile:
- country: ${profile.country ?? "LV"}
- currency: ${profile.currency ?? "EUR"}
- top size: ${profile.sizeTop ?? "unknown"}
- bottom size: ${profile.sizeBottom ?? "unknown"}
- shoe size: ${profile.sizeShoes ?? "unknown"}
- dress size: ${profile.sizeDress ?? "unknown"}`);
  }

  const neg = memories?.filter((m) => m.sentiment === "negative") ?? [];
  const pos = memories?.filter((m) => m.sentiment === "positive") ?? [];
  if (neg.length > 0) {
    parts.push(`\nNegative past experiences (lower confidence for similar items):\n${neg.map((m) => `- ${m.summary}`).join("\n")}`);
  }
  if (pos.length > 0) {
    parts.push(`\nPositive past experiences (higher confidence for similar items):\n${pos.map((m) => `- ${m.summary}`).join("\n")}`);
  }

  parts.push(`\nReturn 4-6 candidates as JSON: { "candidates": [...] }`);

  return parts.join("\n");
}

function mapRawToCandidate(
  c: Record<string, unknown>,
  intent: ShoppingIntent,
  currency: string,
): ShoppingCandidate {
  return {
    title: typeof c.title === "string" ? c.title : "Product",
    brand: typeof c.brand === "string" ? c.brand : "",
    retailer: typeof c.retailer === "string" ? c.retailer : "zalando",
    price: typeof c.price === "number" ? c.price : null,
    currency: typeof c.currency === "string" ? c.currency : currency,
    size: typeof c.size === "string" ? c.size : intent.size,
    color: typeof c.color === "string" ? c.color : intent.color,
    url: "",
    confidence: typeof c.confidence === "number" ? Math.min(1, Math.max(0, c.confidence)) : 0.5,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SearchRequest;

  if (!body.intent?.garmentClass) {
    return NextResponse.json({ error: "intent.garmentClass is required" }, { status: 400 });
  }

  const intent = body.intent;
  const currency = body.profile?.currency ?? intent.currency ?? "EUR";

  const profile = body.profile;

  const finalize = (candidates: ShoppingCandidate[]) =>
    applyCanonicalRetailerUrls(candidates, intent, profile);

  // Fallback: no OpenAI — two strong default suggestions; URLs filled by applyCanonicalRetailerUrls.
  if (!env.OPENAI_API_KEY) {
    const fallback: ShoppingCandidate[] = finalize([
      {
        title: `${intent.color ? `${intent.color} ` : ""}${intent.garmentClass} (Asket)`,
        brand: "Asket",
        retailer: "asket",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: "",
        confidence: 0.7,
      },
      {
        title: `${intent.color ? `${intent.color} ` : ""}${intent.garmentClass} (Zalando)`,
        brand: "Various",
        retailer: "zalando",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: "",
        confidence: 0.6,
      },
    ]);
    return NextResponse.json({ candidates: fallback });
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SEARCH_SYSTEM },
        { role: "user", content: buildSearchPrompt(body) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as { candidates?: unknown[] };
    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

    const candidates: ShoppingCandidate[] = finalize(
      rawCandidates
        .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
        .map((row) => mapRawToCandidate(row, intent, currency))
        .sort((a, b) => b.confidence - a.confidence),
    );

    return NextResponse.json({ candidates });
  } catch {
    const fallback: ShoppingCandidate[] = finalize([
      {
        title: `${intent.garmentClass} on Asket`,
        brand: "Asket",
        retailer: "asket",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: "",
        confidence: 0.6,
      },
      {
        title: `${intent.garmentClass} on Zalando`,
        brand: "Various",
        retailer: "zalando",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: "",
        confidence: 0.5,
      },
    ]);
    return NextResponse.json({ candidates: fallback });
  }
}
