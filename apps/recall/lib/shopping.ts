/**
 * Supabase-backed shopping profile and memory management.
 * Ported from shopping-assistent-factory/src/shopping-profile.mjs (cursor-runner branch).
 * Original used JSON file storage; this uses Supabase with per-user RLS.
 */

import type { ShoppingProfile, ShoppingMemory, ShoppingSentiment } from "@/lib/types";
import { getUserSupabase } from "@/lib/supabase-server";

// ── Profile ─────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: ShoppingProfile = {
  country: "LV",
  currency: "EUR",
  sizeTop: null,
  sizeBottom: null,
  sizeShoes: null,
  sizeDress: null,
  budgetAnchors: {},
};

export async function getShoppingProfile(): Promise<ShoppingProfile | null> {
  const supabase = await getUserSupabase();
  if (!supabase) return DEFAULT_PROFILE;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PROFILE;

  const { data, error } = await supabase
    .from("recall_shopping_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return DEFAULT_PROFILE;

  return {
    country: data.country ?? "LV",
    currency: data.currency ?? "EUR",
    sizeTop: data.size_top ?? null,
    sizeBottom: data.size_bottom ?? null,
    sizeShoes: data.size_shoes ?? null,
    sizeDress: data.size_dress ?? null,
    budgetAnchors: (data.budget_anchors as Record<string, number>) ?? {},
  };
}

export async function upsertShoppingProfile(patch: Partial<ShoppingProfile>): Promise<void> {
  const supabase = await getUserSupabase();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("recall_shopping_profiles").upsert({
    user_id: user.id,
    ...(patch.country !== undefined && { country: patch.country }),
    ...(patch.currency !== undefined && { currency: patch.currency }),
    ...(patch.sizeTop !== undefined && { size_top: patch.sizeTop }),
    ...(patch.sizeBottom !== undefined && { size_bottom: patch.sizeBottom }),
    ...(patch.sizeShoes !== undefined && { size_shoes: patch.sizeShoes }),
    ...(patch.sizeDress !== undefined && { size_dress: patch.sizeDress }),
    ...(patch.budgetAnchors !== undefined && { budget_anchors: patch.budgetAnchors }),
    updated_at: new Date().toISOString(),
  });
}

// ── Memories ─────────────────────────────────────────────────────────────────

function inferSentiment(text: string): ShoppingSentiment {
  const lower = text.toLowerCase();
  const negativeWords = ["dislike", "returned", "bad", "poor", "wrong", "hate", "disappointed", "broken", "refund"];
  const positiveWords = ["love", "great", "perfect", "excellent", "kept", "best", "amazing", "beautiful", "fits"];

  const negScore = negativeWords.filter((w) => lower.includes(w)).length;
  const posScore = positiveWords.filter((w) => lower.includes(w)).length;

  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}

export async function getShoppingMemories(): Promise<ShoppingMemory[]> {
  const supabase = await getUserSupabase();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("recall_shopping_memories")
    .select("*")
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    summary: row.summary as string,
    sentiment: row.sentiment as ShoppingSentiment,
    tags: (row.tags as string[]) ?? [],
    retailer: row.retailer as string | null,
    brand: row.brand as string | null,
    product: row.product as string | null,
    color: row.color as string | null,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at as string,
  }));
}

export interface CreateMemoryInput {
  summary: string;
  sentiment?: ShoppingSentiment;
  tags?: string[];
  retailer?: string | null;
  brand?: string | null;
  product?: string | null;
  color?: string | null;
  pinned?: boolean;
}

export async function createShoppingMemory(input: CreateMemoryInput): Promise<ShoppingMemory | null> {
  const supabase = await getUserSupabase();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const sentiment = input.sentiment ?? inferSentiment(input.summary);

  const { data, error } = await supabase
    .from("recall_shopping_memories")
    .insert({
      user_id: user.id,
      summary: input.summary.trim(),
      sentiment,
      tags: input.tags ?? [],
      retailer: input.retailer ?? null,
      brand: input.brand ?? null,
      product: input.product ?? null,
      color: input.color ?? null,
      pinned: input.pinned ?? false,
    })
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id as string,
    summary: data.summary as string,
    sentiment: data.sentiment as ShoppingSentiment,
    tags: (data.tags as string[]) ?? [],
    retailer: data.retailer as string | null,
    brand: data.brand as string | null,
    product: data.product as string | null,
    color: data.color as string | null,
    pinned: Boolean(data.pinned),
    createdAt: data.created_at as string,
  };
}

export async function deleteShoppingMemory(id: string): Promise<void> {
  const supabase = await getUserSupabase();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("recall_shopping_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function pinShoppingMemory(id: string, pinned: boolean): Promise<void> {
  const supabase = await getUserSupabase();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("recall_shopping_memories")
    .update({ pinned })
    .eq("id", id)
    .eq("user_id", user.id);
}
