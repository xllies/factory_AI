"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { ShoppingCandidate, ShoppingIntent, ShoppingMemory, ShoppingProfile } from "@/lib/types";
import { parseShoppingIntent, detectShoppingIntent } from "@/lib/shopping-intent";

type Tab = "search" | "memories" | "profile";

const SENTIMENT_ICON: Record<string, string> = {
  positive: "💚",
  negative: "💔",
  neutral: "⚪",
};

const RETAILER_LABELS: Record<string, string> = {
  asket: "Asket",
  zalando: "Zalando",
  zara: "Zara",
  hm: "H&M",
  uniqlo: "Uniqlo",
  asos: "ASOS",
};

export default function ShoppingPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}><p>Loading…</p></main>}>
      <ShoppingPageInner />
    </Suspense>
  );
}

function ShoppingPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ShoppingCandidate[]>([]);
  const [lastIntent, setLastIntent] = useState<ShoppingIntent | null>(null);
  const [memories, setMemories] = useState<ShoppingMemory[]>([]);
  const [profile, setProfile] = useState<ShoppingProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingMemory, setAddingMemory] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [profileForm, setProfileForm] = useState<Partial<ShoppingProfile>>({});

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping/profile");
      if (res.ok) {
        const data = await res.json() as { profile: ShoppingProfile };
        setProfile(data.profile);
        setProfileForm(data.profile);
      }
    } catch {}
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping/memories");
      if (res.ok) {
        const data = await res.json() as { memories: ShoppingMemory[] };
        setMemories(data.memories);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadMemories();
  }, [loadProfile, loadMemories]);

  // Auto-search when navigated here from the capture page with a ?q= param.
  const initialQ = searchParams.get("q");
  useEffect(() => {
    if (initialQ) void runSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(text: string) {
    if (!text.trim()) return;
    setSearching(true);
    setCandidates([]);

    const intent = parseShoppingIntent(text);
    if (profile?.currency) intent.currency = profile.currency;
    setLastIntent(intent);

    try {
      const res = await fetch("/api/shopping/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          profile,
          memories: memories.slice(0, 10).map((m) => ({
            summary: m.summary,
            sentiment: m.sentiment,
            retailer: m.retailer,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json() as { candidates: ShoppingCandidate[] };
        setCandidates(data.candidates);
      }
    } catch {}

    setSearching(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!detectShoppingIntent(query) && query.trim()) {
      // accept any query; parseShoppingIntent will extract what it can
    }
    await runSearch(query);
  }

  async function saveMemory() {
    if (!newMemory.trim()) return;
    setAddingMemory(true);
    try {
      await fetch("/api/shopping/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: newMemory.trim() }),
      });
      setNewMemory("");
      await loadMemories();
    } catch {}
    setAddingMemory(false);
  }

  async function deleteMemory(id: string) {
    await fetch(`/api/shopping/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function pinMemory(id: string, pinned: boolean) {
    await fetch("/api/shopping/memories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pinned }),
    });
    setMemories((prev) => prev.map((m) => m.id === id ? { ...m, pinned } : m));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/shopping/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        const data = await res.json() as { profile: ShoppingProfile };
        setProfile(data.profile);
      }
    } catch {}
    setSavingProfile(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ margin: "0 0 1.25rem", fontSize: "1.4rem", fontWeight: 700 }}>
        Shopping Assistant
      </h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["search", "memories", "profile"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: 999,
              border: "1.5px solid",
              borderColor: tab === t ? "var(--accent, #0b6b57)" : "var(--muted, #ccc)",
              background: tab === t ? "var(--accent, #0b6b57)" : "transparent",
              color: tab === t ? "#fff" : "inherit",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: tab === t ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {t === "search" ? "🔍 Search" : t === "memories" ? "🧠 Memories" : "⚙️ Profile"}
          </button>
        ))}
      </div>

      {/* ── Search tab ── */}
      {tab === "search" && (
        <div>
          <form onSubmit={(e) => void handleSearch(e)} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "white linen shirt size M under €80" or "black sneakers from Zalando"'
              style={{
                flex: 1,
                padding: "0.6rem 0.9rem",
                borderRadius: 8,
                border: "1.5px solid var(--muted, #ccc)",
                fontSize: "0.95rem",
                background: "var(--paper, #fff)",
                color: "inherit",
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              style={{
                padding: "0.6rem 1.2rem",
                borderRadius: 8,
                border: "none",
                background: "var(--accent, #0b6b57)",
                color: "#fff",
                fontWeight: 600,
                cursor: searching ? "wait" : "pointer",
                opacity: !query.trim() ? 0.5 : 1,
              }}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {lastIntent && (
            <div style={{ marginBottom: "1rem", fontSize: "0.8rem", color: "var(--muted-text, #666)" }}>
              Looking for: <strong>{lastIntent.garmentClass}</strong>
              {lastIntent.color && <> · {lastIntent.color}</>}
              {lastIntent.size && <> · size {lastIntent.size}</>}
              {lastIntent.budget && <> · under {lastIntent.budget} {lastIntent.currency}</>}
              {lastIntent.retailer && <> · from {RETAILER_LABELS[lastIntent.retailer] ?? lastIntent.retailer}</>}
            </div>
          )}

          {searching && (
            <p style={{ color: "var(--muted-text, #666)", fontSize: "0.9rem" }}>
              Finding the best matches…
            </p>
          )}

          {candidates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {candidates.map((c, i) => (
                <CandidateCard key={i} candidate={c} onSaveMemory={async (summary) => {
                  await fetch("/api/shopping/memories", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ summary, retailer: c.retailer }),
                  });
                  await loadMemories();
                }} />
              ))}
            </div>
          )}

          {!searching && candidates.length === 0 && query && (
            <p style={{ color: "var(--muted-text, #666)", fontSize: "0.9rem" }}>
              No results yet — try a search above.
            </p>
          )}

          {candidates.length === 0 && !query && (
            <div style={{ color: "var(--muted-text, #666)", fontSize: "0.9rem" }}>
              <p>Describe what you&apos;re looking for in plain language. You can also capture shopping requests from the main screen — they&apos;ll be classified as Shopping entries.</p>
              <p style={{ marginTop: "0.5rem" }}>Examples:</p>
              <ul style={{ marginTop: "0.25rem", paddingLeft: "1.25rem" }}>
                <li>white linen shirt size M under €80 from Asket</li>
                <li>black slim trousers Zalando</li>
                <li>running shoes size 42 under €120</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Memories tab ── */}
      {tab === "memories" && (
        <div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <input
              type="text"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder='e.g. "Returned Asket shirt — fabric too stiff"'
              style={{
                flex: 1,
                padding: "0.6rem 0.9rem",
                borderRadius: 8,
                border: "1.5px solid var(--muted, #ccc)",
                fontSize: "0.9rem",
                background: "var(--paper, #fff)",
                color: "inherit",
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void saveMemory(); }}
            />
            <button
              onClick={() => void saveMemory()}
              disabled={addingMemory || !newMemory.trim()}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: 8,
                border: "none",
                background: "var(--accent, #0b6b57)",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                opacity: !newMemory.trim() ? 0.5 : 1,
              }}
            >
              Add
            </button>
          </div>

          {memories.length === 0 ? (
            <p style={{ color: "var(--muted-text, #666)", fontSize: "0.9rem" }}>
              No shopping memories yet. Add notes about past purchases — the assistant will use them to improve recommendations.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {memories.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: 10,
                    border: "1.5px solid",
                    borderColor: m.pinned ? "var(--accent, #0b6b57)" : "var(--muted, #e5e5e5)",
                    background: "var(--paper, #fff)",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: "1.1rem", lineHeight: 1.4 }}>
                    {SENTIMENT_ICON[m.sentiment]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: "0.9rem" }}>{m.summary}</p>
                    {(m.retailer || m.brand || m.color) && (
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: "var(--muted-text, #888)" }}>
                        {[m.brand, m.retailer ? RETAILER_LABELS[m.retailer] ?? m.retailer : null, m.color]
                          .filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      title={m.pinned ? "Unpin" : "Pin"}
                      onClick={() => void pinMemory(m.id, !m.pinned)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", opacity: m.pinned ? 1 : 0.4 }}
                    >
                      📌
                    </button>
                    <button
                      title="Delete"
                      onClick={() => void deleteMemory(m.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", opacity: 0.5 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Profile tab ── */}
      {tab === "profile" && (
        <form onSubmit={(e) => void saveProfile(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted-text, #666)" }}>
            Your shopping profile is used to pre-fill sizes and currency in search results.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {[
              { label: "Country (2-letter)", key: "country", placeholder: "LV" },
              { label: "Currency", key: "currency", placeholder: "EUR" },
              { label: "Top size", key: "sizeTop", placeholder: "M" },
              { label: "Bottom size", key: "sizeBottom", placeholder: "32/30" },
              { label: "Shoe size (EU)", key: "sizeShoes", placeholder: "42" },
              { label: "Dress size", key: "sizeDress", placeholder: "S" },
            ].map(({ label, key, placeholder }) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{label}</span>
                <input
                  type="text"
                  value={(profileForm as Record<string, string | null>)[key] ?? ""}
                  onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value || null }))}
                  placeholder={placeholder}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: 7,
                    border: "1.5px solid var(--muted, #ccc)",
                    fontSize: "0.9rem",
                    background: "var(--paper, #fff)",
                    color: "inherit",
                  }}
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            style={{
              alignSelf: "flex-start",
              padding: "0.55rem 1.4rem",
              borderRadius: 8,
              border: "none",
              background: "var(--accent, #0b6b57)",
              color: "#fff",
              fontWeight: 600,
              cursor: savingProfile ? "wait" : "pointer",
            }}
          >
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </form>
      )}
    </main>
  );
}

interface CandidateCardProps {
  candidate: ShoppingCandidate;
  onSaveMemory: (summary: string) => Promise<void>;
}

function CandidateCard({ candidate: c, onSaveMemory }: CandidateCardProps) {
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await onSaveMemory(`Checked out ${c.brand} ${c.title}${c.color ? ` in ${c.color}` : ""} from ${RETAILER_LABELS[c.retailer] ?? c.retailer}`);
    setSaved(true);
  }

  const confidenceColor = c.confidence >= 0.75 ? "#0b6b57" : c.confidence >= 0.5 ? "#b87e00" : "#999";

  return (
    <div
      style={{
        padding: "0.85rem 1rem",
        borderRadius: 10,
        border: "1.5px solid var(--muted, #e5e5e5)",
        background: "var(--paper, #fff)",
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
          <strong style={{ fontSize: "0.95rem" }}>{c.title}</strong>
          <span
            style={{
              fontSize: "0.72rem",
              padding: "0.1rem 0.45rem",
              borderRadius: 999,
              background: confidenceColor + "22",
              color: confidenceColor,
              fontWeight: 600,
            }}
          >
            {Math.round(c.confidence * 100)}% match
          </span>
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--muted-text, #666)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span>{c.brand}</span>
          <span>·</span>
          <span>{RETAILER_LABELS[c.retailer] ?? c.retailer}</span>
          {c.color && <><span>·</span><span>{c.color}</span></>}
          {c.size && <><span>·</span><span>Size {c.size}</span></>}
          {c.price && <><span>·</span><span>{c.price} {c.currency}</span></>}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
        <button
          title={saved ? "Saved to memories" : "Save to memories"}
          onClick={() => void handleSave()}
          disabled={saved}
          style={{
            background: "none", border: "none", cursor: saved ? "default" : "pointer",
            fontSize: "1rem", opacity: saved ? 1 : 0.5,
          }}
        >
          {saved ? "💚" : "🧠"}
        </button>
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "0.4rem 0.8rem",
            borderRadius: 6,
            background: "var(--accent, #0b6b57)",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Shop →
        </a>
      </div>
    </div>
  );
}
