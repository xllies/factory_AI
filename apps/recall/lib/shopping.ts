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

export type UpsertShoppingProfileResult =
  | { ok: true }
  | { ok: false; code: "no_client" | "no_user" | "db_error"; message?: string };

/**
 * Upsert without sending `user_id` — DB trigger sets it on insert so `auth.uid()` always matches RLS.
 * Use `onConflict: user_id` so existing rows (e.g. from signup trigger) update correctly.
 */
export async function upsertShoppingProfile(
  patch: Partial<ShoppingProfile>,
): Promise<UpsertShoppingProfileResult> {
  const supabase = await getUserSupabase();
  if (!supabase) return { ok: false, code: "no_client" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "no_user" };

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.country !== undefined) row.country = patch.country;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.sizeTop !== undefined) row.size_top = patch.sizeTop;
  if (patch.sizeBottom !== undefined) row.size_bottom = patch.sizeBottom;
  if (patch.sizeShoes !== undefined) row.size_shoes = patch.sizeShoes;
  if (patch.sizeDress !== undefined) row.size_dress = patch.sizeDress;
  if (patch.budgetAnchors !== undefined) row.budget_anchors = patch.budgetAnchors;

  const { error } = await supabase.from("recall_shopping_profiles").upsert(row, {
    onConflict: "user_id",
  });

  if (error) return { ok: false, code: "db_error", message: error.message };
  return { ok: true };
}

// ── Memories ─────────────────────────────────────────────────────────────────

/** Uses only validated JWT user — must match what Postgres sees as `auth.uid()` for RLS. */
async function resolveShoppingUserId(
  supabase: NonNullable<Awaited<ReturnType<typeof getUserSupabase>>>,
): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  return u.user?.id ?? null;
}

function mapMemoryRow(row: Record<string, unknown>): ShoppingMemory {
  return {
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
  };
}

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

export type GetShoppingMemoriesResult =
  | { ok: true; memories: ShoppingMemory[] }
  | { ok: false; code: "no_client" | "no_user" | "db_error"; message?: string };

export async function getShoppingMemories(): Promise<GetShoppingMemoriesResult> {
  const supabase = await getUserSupabase();
  if (!supabase) return { ok: false, code: "no_client" };

  const userId = await resolveShoppingUserId(supabase);
  if (!userId) return { ok: false, code: "no_user" };

  const { data, error } = await supabase
    .from("recall_shopping_memories")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, code: "db_error", message: error.message };
  }
  if (!data) return { ok: true, memories: [] };

  return { ok: true, memories: data.map((row) => mapMemoryRow(row as Record<string, unknown>)) };
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

export type CreateShoppingMemoryResult =
  | { ok: true; memory: ShoppingMemory }
  | { ok: false; code: "no_client" | "no_user" | "db_error"; message?: string };

export async function createShoppingMemory(input: CreateMemoryInput): Promise<CreateShoppingMemoryResult> {
  const supabase = await getUserSupabase();
  if (!supabase) return { ok: false, code: "no_client" };

  const userId = await resolveShoppingUserId(supabase);
  if (!userId) return { ok: false, code: "no_user" };

  const sentiment = input.sentiment ?? inferSentiment(input.summary);

  // Omit user_id: DB trigger sets it from auth.uid() so RLS always matches the JWT.
  const { data, error } = await supabase
    .from("recall_shopping_memories")
    .insert({
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

  if (error) {
    return { ok: false, code: "db_error", message: error.message };
  }
  if (!data) {
    return { ok: false, code: "db_error", message: "Insert returned no row" };
  }

  return { ok: true, memory: mapMemoryRow(data as Record<string, unknown>) };
}

export async function deleteShoppingMemory(id: string): Promise<void> {
  const supabase = await getUserSupabase();
  if (!supabase) return;

  const userId = await resolveShoppingUserId(supabase);
  if (!userId) return;

  await supabase
    .from("recall_shopping_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
}

export async function pinShoppingMemory(id: string, pinned: boolean): Promise<void> {
  const supabase = await getUserSupabase();
  if (!supabase) return;

  const userId = await resolveShoppingUserId(supabase);
  if (!userId) return;

  await supabase
    .from("recall_shopping_memories")
    .update({ pinned })
    .eq("id", id)
    .eq("user_id", userId);
}
