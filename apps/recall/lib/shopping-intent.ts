/**
 * Keyword-based shopping intent detection and garment extraction.
 * Ported from shopping-assistent-factory/src/shopping-chat-flow.mjs (cursor-runner branch).
 */

import type { GarmentClass, ShoppingIntent } from "@/lib/types";

const SHOPPING_KEYWORDS = [
  "buy", "shop", "shopping", "find", "get", "order", "purchase",
  "look for", "searching for", "need a", "want a", "looking for",
  "outfit", "wear", "clothes", "clothing", "fashion",
];

const GARMENT_MAP: Record<GarmentClass, string[]> = {
  tops: [
    "t-shirt", "tshirt", "tee", "shirt", "top", "blouse", "polo",
    "sweater", "hoodie", "sweatshirt", "jumper", "pullover",
  ],
  bottoms: [
    "pants", "trousers", "jeans", "shorts", "skirt",
    "chinos", "leggings", "joggers", "sweatpants",
  ],
  shoes: [
    "shoes", "sneakers", "boots", "loafers", "sandals",
    "trainers", "heels", "flats", "oxfords",
  ],
  dresses: ["dress", "gown", "sundress", "midi", "maxi dress"],
  outerwear: [
    "jacket", "coat", "parka", "blazer", "raincoat",
    "windbreaker", "cardigan", "vest",
  ],
  accessories: [
    "belt", "bag", "wallet", "scarf", "hat", "cap", "gloves",
    "sunglasses", "watch", "jewelry", "socks", "underwear",
  ],
  underwear: ["underwear", "boxers", "briefs", "bra", "lingerie", "socks"],
};

const SIZE_PATTERN =
  /\b(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d{2,3}(?:\/\d{2})?)\b/i;

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR", "$": "USD", "£": "GBP", "kr": "SEK",
};

const BUDGET_PATTERN =
  /(?:under|below|max|less than|up to|budget[:\s]+|around|about|~)?\s*([€$£]|kr)?\s*(\d+(?:[.,]\d+)?)\s*(?:€|\$|£|kr|eur|usd|gbp|sek)?/i;

const RETAILER_MAP: Record<string, string> = {
  asket: "asket",
  zalando: "zalando",
  zara: "zara",
  "h&m": "hm",
  hm: "hm",
  "h m": "hm",
  uniqlo: "uniqlo",
  asos: "asos",
};

export function detectShoppingIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return SHOPPING_KEYWORDS.some((kw) => lower.includes(kw));
}

export function extractGarmentClass(text: string): GarmentClass | null {
  const lower = text.toLowerCase();
  for (const [cls, keywords] of Object.entries(GARMENT_MAP) as [GarmentClass, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return cls;
  }
  return null;
}

export function extractExplicitSize(text: string): string | null {
  const match = SIZE_PATTERN.exec(text);
  return match ? match[1].toUpperCase() : null;
}

export function extractPriceCeiling(text: string): { amount: number; currency: string } | null {
  const match = BUDGET_PATTERN.exec(text);
  if (!match) return null;

  const symbol = match[1] ?? "";
  const raw = match[2]?.replace(",", ".") ?? "";
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) return null;

  const currency = CURRENCY_SYMBOLS[symbol] ?? detectCurrencyWord(text) ?? "EUR";
  return { amount, currency };
}

function detectCurrencyWord(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("eur") || lower.includes("euro")) return "EUR";
  if (lower.includes("usd") || lower.includes("dollar")) return "USD";
  if (lower.includes("gbp") || lower.includes("pound")) return "GBP";
  if (lower.includes("sek") || lower.includes("krona")) return "SEK";
  return null;
}

export function extractColor(text: string): string | null {
  const colors = [
    "white", "black", "grey", "gray", "navy", "blue", "red", "green",
    "brown", "beige", "cream", "off-white", "yellow", "pink", "purple",
    "orange", "olive", "khaki", "camel", "charcoal", "burgundy",
  ];
  const lower = text.toLowerCase();
  return colors.find((c) => lower.includes(c)) ?? null;
}

export function extractRetailer(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, id] of Object.entries(RETAILER_MAP)) {
    if (lower.includes(keyword)) return id;
  }
  return null;
}

export function parseShoppingIntent(text: string): ShoppingIntent {
  const garmentClass = extractGarmentClass(text) ?? "tops";
  const size = extractExplicitSize(text);
  const color = extractColor(text);
  const price = extractPriceCeiling(text);
  const retailer = extractRetailer(text);

  return {
    garmentClass,
    size,
    color,
    budget: price?.amount ?? null,
    currency: price?.currency ?? "EUR",
    retailer,
  };
}
