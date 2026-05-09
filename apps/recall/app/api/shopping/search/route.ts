/**
 * GPT-powered shopping search.
 * Accepts a ShoppingIntent + optional ShoppingProfile and returns ranked candidates.
 * No browser automation — uses OpenAI to generate product recommendations with
 * direct retailer search URLs. Ported logic from shopping-assistent-factory
 * asket-product-search.mjs and zalando-product-search.mjs (cursor-runner branch).
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { env } from "@/lib/env";
import type { ShoppingIntent, ShoppingProfile, ShoppingCandidate } from "@/lib/types";

interface SearchRequest {
  intent: ShoppingIntent;
  profile?: Partial<ShoppingProfile>;
  memories?: Array<{ summary: string; sentiment: string; retailer?: string | null }>;
}

// Build retailer search URLs based on garment class and filters.
function asketSearchUrl(intent: ShoppingIntent): string {
  const collectionMap: Record<string, string> = {
    tops: "t-shirts",
    bottoms: "trousers",
    shoes: "shoes",
    outerwear: "jackets",
    underwear: "underwear",
    accessories: "accessories",
    dresses: "dresses",
  };
  const slug = collectionMap[intent.garmentClass] ?? intent.garmentClass;
  return `https://www.asket.com/collections/${slug}`;
}

function zalandoSearchUrl(intent: ShoppingIntent, currency: string): string {
  const domain = currency === "GBP" ? "en.zalando.co.uk" : "en.zalando.lv";
  const q = encodeURIComponent(
    [intent.color, intent.garmentClass, intent.size ? `size ${intent.size}` : ""]
      .filter(Boolean)
      .join(" ")
  );
  return `https://${domain}/search/?q=${q}`;
}

const SEARCH_SYSTEM = `You are a personal shopping assistant. Given a shopping intent and the user's style profile, generate 4-6 specific product recommendations.

For each candidate, provide:
- title: specific product name (e.g. "Classic Oxford Shirt", "Slim Fit Chinos")
- brand: brand name
- retailer: one of "asket", "zalando", "zara", "uniqlo", "hm", or "asos"
- price: estimated price as a number (null if unknown)
- currency: 3-letter code matching the user's currency
- size: recommended size based on the user's profile (null if no profile data)
- color: specific color recommendation
- url: a realistic, working retailer search URL (not a product page — a search or collection URL)
- confidence: 0.0–1.0 score for how well this matches the intent

Rules:
- Prefer "asket" for minimalist, sustainable basics (t-shirts, shirts, trousers, underwear).
- Prefer "zalando" for wider variety, trend pieces, shoes.
- If the user specified a retailer, only return candidates from that retailer.
- Apply negative shopping memories: if the user had a bad experience with a brand/color/retailer, reduce confidence and note it.
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SearchRequest;

  if (!body.intent?.garmentClass) {
    return NextResponse.json({ error: "intent.garmentClass is required" }, { status: 400 });
  }

  const intent = body.intent;
  const currency = body.profile?.currency ?? intent.currency ?? "EUR";

  // Fallback: generate basic candidates from known URL patterns without calling OpenAI.
  if (!env.OPENAI_API_KEY) {
    const fallback: ShoppingCandidate[] = [
      {
        title: `${intent.color ? intent.color + " " : ""}${intent.garmentClass}`,
        brand: "Asket",
        retailer: "asket",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: asketSearchUrl(intent),
        confidence: 0.7,
      },
      {
        title: `${intent.color ? intent.color + " " : ""}${intent.garmentClass}`,
        brand: "Various",
        retailer: "zalando",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: zalandoSearchUrl(intent, currency),
        confidence: 0.6,
      },
    ];
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

    const candidates: ShoppingCandidate[] = rawCandidates
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c) => ({
        title: typeof c.title === "string" ? c.title : "Product",
        brand: typeof c.brand === "string" ? c.brand : "",
        retailer: typeof c.retailer === "string" ? c.retailer : "zalando",
        price: typeof c.price === "number" ? c.price : null,
        currency: typeof c.currency === "string" ? c.currency : currency,
        size: typeof c.size === "string" ? c.size : intent.size,
        color: typeof c.color === "string" ? c.color : intent.color,
        url: typeof c.url === "string" ? c.url : zalandoSearchUrl(intent, currency),
        confidence: typeof c.confidence === "number" ? Math.min(1, Math.max(0, c.confidence)) : 0.5,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({ candidates });
  } catch {
    // If OpenAI fails, return fallback search links.
    const fallback: ShoppingCandidate[] = [
      {
        title: `${intent.garmentClass} on Asket`,
        brand: "Asket",
        retailer: "asket",
        price: null,
        currency,
        size: intent.size,
        color: intent.color,
        url: asketSearchUrl(intent),
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
        url: zalandoSearchUrl(intent, currency),
        confidence: 0.5,
      },
    ];
    return NextResponse.json({ candidates: fallback });
  }
}
