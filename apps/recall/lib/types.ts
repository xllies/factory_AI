export type EntryType = "memory" | "action" | "shopping";

export type EntrySource = "voice" | "text" | "upload" | "import";

export interface Entry {
  id: string;
  type: EntryType;
  raw: string;
  summary: string;
  tags: string[];
  done: boolean;
  /** ISO timestamp of when the action is due, e.g. "call mom tomorrow at 5pm". */
  dueAt: string | null;
  /** ISO timestamp of when to alert the user. Defaults to dueAt if not specified. */
  remindAt: string | null;
  /** ISO timestamp of when we last fired a notification for this entry. */
  notifiedAt: string | null;
  /** Optional location, parsed from input. */
  location: string | null;
  /** Where the entry came from. */
  source: EntrySource;
  createdAt: string;
}

export interface ClassifyResult {
  type: EntryType;
  summary: string;
  tags: string[];
  /** ISO datetime if a time was mentioned, else null. */
  dueAt: string | null;
  location: string | null;
  /** Populated when type === "shopping". */
  shopping?: ShoppingIntent;
}

// ── Shopping types (ported from shopping-assistent-factory cursor-runner) ───

export type GarmentClass =
  | "tops" | "bottoms" | "shoes" | "dresses" | "outerwear" | "accessories" | "underwear";

export type ShoppingSentiment = "positive" | "negative" | "neutral";

export interface ShoppingIntent {
  garmentClass: GarmentClass | string;
  size: string | null;
  color: string | null;
  budget: number | null;
  currency: string;
  retailer: string | null;
}

export interface ShoppingCandidate {
  title: string;
  brand: string;
  retailer: string;
  price: number | null;
  currency: string;
  size: string | null;
  color: string | null;
  url: string;
  confidence: number;
}

export interface ShoppingProfile {
  country: string;
  currency: string;
  sizeTop: string | null;
  sizeBottom: string | null;
  sizeShoes: string | null;
  sizeDress: string | null;
  budgetAnchors: Record<string, number>;
}

export interface ShoppingMemory {
  id: string;
  summary: string;
  sentiment: ShoppingSentiment;
  tags: string[];
  retailer: string | null;
  brand: string | null;
  product: string | null;
  color: string | null;
  pinned: boolean;
  createdAt: string;
}
