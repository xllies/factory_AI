"use client";

import type { Entry } from "@/lib/types";

/**
 * Client-side cache of entries. Uses Supabase as the source of truth when
 * the user is signed in, and falls back to localStorage when offline or
 * Supabase isn't configured.
 */
const STORAGE_KEY = "recall-entries";

function loadLocal(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Entry[];
  } catch {
    return [];
  }
}

function saveLocal(entries: Entry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 500)));
  } catch {}
}

export async function fetchEntries(): Promise<Entry[]> {
  try {
    const res = await fetch("/api/entries", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { entries?: Entry[] };
      if (Array.isArray(data.entries)) {
        saveLocal(data.entries);
        return data.entries;
      }
    }
  } catch {}
  return loadLocal();
}

export async function createEntry(entry: Omit<Entry, "id" | "createdAt" | "done" | "notifiedAt">): Promise<Entry> {
  const optimistic: Entry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    done: false,
    notifiedAt: null,
  };

  const local = [optimistic, ...loadLocal()].slice(0, 500);
  saveLocal(local);

  try {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optimistic),
    });
    if (res.ok) {
      const data = (await res.json()) as { entry?: Entry };
      if (data.entry) {
        const merged = [data.entry, ...loadLocal().filter((e) => e.id !== optimistic.id)];
        saveLocal(merged);
        return data.entry;
      }
    }
  } catch {}

  return optimistic;
}

export async function updateEntry(id: string, patch: Partial<Pick<Entry, "done" | "dueAt" | "remindAt" | "notifiedAt" | "summary">>): Promise<void> {
  const local = loadLocal().map((e) => (e.id === id ? { ...e, ...patch } : e));
  saveLocal(local);
  try {
    await fetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  } catch {}
}

export async function deleteEntry(id: string): Promise<void> {
  const local = loadLocal().filter((e) => e.id !== id);
  saveLocal(local);
  try {
    await fetch(`/api/entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {}
}

export function getLocalEntries(): Entry[] {
  return loadLocal();
}

export function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
