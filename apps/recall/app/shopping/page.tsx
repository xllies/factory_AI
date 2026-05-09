"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ShoppingCandidate, ShoppingIntent, ShoppingMemory, ShoppingProfile } from "@/lib/types";
import { parseShoppingIntent, detectShoppingIntent } from "@/lib/shopping-intent";

type Tab = "search" | "memories" | "profile";

async function shoppingApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; detail?: string };
    const parts = [j.error, j.detail].filter((p): p is string => Boolean(p));
    return parts.join(" — ") || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

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

function ShoppingPageContent() {
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
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      const res = await fetch("/api/shopping/memories", { cache: "no-store" });
      if (res.status === 401) {
        setMemories([]);
        setMemoryError("You need to be signed in to save and view shopping memories.");
        return;
      }
      if (!res.ok) {
        setMemories([]);
        setMemoryError(await shoppingApiError(res));
        return;
      }
      const data = (await res.json()) as { memories: ShoppingMemory[] };
      setMemories(data.memories);
      setMemoryError(null);
    } catch {
      setMemories([]);
      setMemoryError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadMemories();
  }, [loadProfile, loadMemories]);

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
    setMemoryError(null);
    try {
      const res = await fetch("/api/shopping/memories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: newMemory.trim() }),
      });
      if (!res.ok) {
        setMemoryError(await shoppingApiError(res));
        return;
      }
      setNewMemory("");
      await loadMemories();
    } catch {
      setMemoryError("Could not reach the server.");
    } finally {
      setAddingMemory(false);
    }
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
    setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, pinned } : m)));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/shopping/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) {
        setProfileError(await shoppingApiError(res));
        return;
      }
      const data = (await res.json()) as { profile: ShoppingProfile };
      setProfile(data.profile);
      setProfileForm(data.profile);
    } catch {
      setProfileError("Could not reach the server.");
    } finally {
      setSavingProfile(false);
    }
  }

  const tabLabels: Record<Tab, string> = {
    search: "🔍 Search",
    memories: "🧠 Memories",
    profile: "⚙️ Profile",
  };

  return (
    <main className="shopping-main">
      <header className="shopping-hero">
        <div className="shopping-hero-inner">
          <p className="shopping-eyebrow">Personal</p>
          <h1 className="shopping-title">Shopping assistant</h1>
          <p className="shopping-lede">
            Search in plain language, save what worked (or didn&apos;t), and keep sizes and currency in sync across
            recommendations.
          </p>
        </div>
      </header>

      <div className="shopping-tabs" role="tablist" aria-label="Shopping sections">
        {(["search", "memories", "profile"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`shopping-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <div className="shopping-panel">
          <form className="shopping-search-row" onSubmit={(e) => void handleSearch(e)}>
            <input
              type="text"
              className="text-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. white linen shirt size M under €80, or black sneakers from Zalando"
              autoFocus
              aria-label="Shopping search"
            />
            <button type="submit" disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {lastIntent && (
            <div className="shopping-intent">
              <span>
                Looking for <strong>{lastIntent.garmentClass}</strong>
              </span>
              {(() => {
                const bits: string[] = [];
                if (lastIntent.color) bits.push(lastIntent.color);
                if (lastIntent.size) bits.push(`size ${lastIntent.size}`);
                if (lastIntent.budget) bits.push(`under ${lastIntent.budget} ${lastIntent.currency}`);
                if (lastIntent.retailer) {
                  bits.push(`from ${RETAILER_LABELS[lastIntent.retailer] ?? lastIntent.retailer}`);
                }
                if (bits.length === 0) return null;
                return <span className="shopping-intent-detail">{bits.join(" · ")}</span>;
              })()}
            </div>
          )}

          {searching && (
            <div className="shopping-loader" aria-live="polite">
              <span className="shopping-loader-dots" aria-hidden>
                <span className="shopping-loader-dot" />
                <span className="shopping-loader-dot" />
                <span className="shopping-loader-dot" />
              </span>
              <span>Finding the best matches…</span>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="shopping-candidates">
              {candidates.map((c, i) => (
                <CandidateCard
                  key={`${c.url}-${i}`}
                  candidate={c}
                  onSaveMemory={async (summary) => {
                    const res = await fetch("/api/shopping/memories", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ summary, retailer: c.retailer }),
                    });
                    if (!res.ok) {
                      setMemoryError(await shoppingApiError(res));
                      return false;
                    }
                    setMemoryError(null);
                    await loadMemories();
                    return true;
                  }}
                />
              ))}
            </div>
          )}

          {!searching && candidates.length === 0 && query && (
            <div className="shopping-empty">
              <p>No results yet — try refining your search or check spelling.</p>
            </div>
          )}

          {candidates.length === 0 && !query && (
            <div className="shopping-empty shopping-examples">
              <p>
                Describe what you&apos;re looking for in plain language. You can also capture shopping requests from the
                capture screen — they&apos;ll be classified as shopping.
              </p>
              <div className="shopping-examples-title">Examples</div>
              <ul>
                <li>White linen shirt size M under €80 from Asket</li>
                <li>Black slim trousers Zalando</li>
                <li>Running shoes size 42 under €120</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "memories" && (
        <div className="shopping-panel">
          {memoryError && (
            <p className="error-msg" style={{ textAlign: "left" }}>
              {memoryError}
              {memoryError.includes("signed in") ? (
                <>
                  {" "}
                  <Link href="/login" className="view-all">
                    Sign in
                  </Link>
                </>
              ) : null}
            </p>
          )}
          <div className="shopping-memory-add">
            <input
              type="text"
              className="text-input"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="e.g. Returned Asket shirt — fabric too stiff"
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveMemory();
              }}
              aria-label="New shopping memory"
            />
            <button type="button" onClick={() => void saveMemory()} disabled={addingMemory || !newMemory.trim()}>
              Add note
            </button>
          </div>

          {memories.length === 0 && !memoryError && (
            <div className="shopping-empty">
              <p>
                No shopping memories yet. Add notes about past purchases — the assistant uses them to tune future picks.
              </p>
            </div>
          )}
          {memories.length > 0 && (
            <div className="shopping-memories">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className={`shopping-memory-card${m.pinned ? " is-pinned" : ""}`}
                >
                  <span className="shopping-memory-sentiment" aria-hidden>
                    {SENTIMENT_ICON[m.sentiment]}
                  </span>
                  <div className="shopping-memory-body">
                    <p className="shopping-memory-summary">{m.summary}</p>
                    {(m.retailer || m.brand || m.color) && (
                      <p className="shopping-memory-extra">
                        {[m.brand, m.retailer ? RETAILER_LABELS[m.retailer] ?? m.retailer : null, m.color]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="shopping-memory-actions">
                    <button
                      type="button"
                      className="ghost"
                      title={m.pinned ? "Unpin" : "Pin"}
                      aria-pressed={m.pinned}
                      onClick={() => void pinMemory(m.id, !m.pinned)}
                    >
                      {m.pinned ? "Pinned" : "Pin"}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      title="Delete"
                      onClick={() => void deleteMemory(m.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "profile" && (
        <form className="shopping-panel" onSubmit={(e) => void saveProfile(e)}>
          <section className="shopping-profile-section">
            {profileError && (
              <p className="error-msg" style={{ textAlign: "left" }}>
                {profileError}
                {profileError.includes("authenticated") || profileError.includes("signed in") ? (
                  <>
                    {" "}
                    <Link href="/login" className="view-all">
                      Sign in
                    </Link>
                  </>
                ) : null}
              </p>
            )}
            <p className="page-subtitle">Sizes and currency are applied when you search so suggestions stay in your range.</p>

            <div className="shopping-profile-grid">
              {[
                { label: "Country (ISO)", key: "country", placeholder: "LV" },
                { label: "Currency", key: "currency", placeholder: "EUR" },
                { label: "Top size", key: "sizeTop", placeholder: "M" },
                { label: "Bottom size", key: "sizeBottom", placeholder: "32/30" },
                { label: "Shoe size (EU)", key: "sizeShoes", placeholder: "42" },
                { label: "Dress size", key: "sizeDress", placeholder: "S" },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="shopping-field">
                  <label htmlFor={`shop-${key}`}>{label}</label>
                  <input
                    id={`shop-${key}`}
                    type="text"
                    value={(profileForm as Record<string, string | null>)[key] ?? ""}
                    onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value || null }))}
                    placeholder={placeholder}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>

            <button type="submit" disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </section>
        </form>
      )}
    </main>
  );
}

interface CandidateCardProps {
  candidate: ShoppingCandidate;
  onSaveMemory: (summary: string) => Promise<boolean>;
}

function matchTier(confidence: number): "high" | "med" | "low" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "med";
  return "low";
}

function CandidateCard({ candidate: c, onSaveMemory }: CandidateCardProps) {
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const ok = await onSaveMemory(
      `Checked out ${c.brand} ${c.title}${c.color ? ` in ${c.color}` : ""} from ${RETAILER_LABELS[c.retailer] ?? c.retailer}`,
    );
    if (ok) setSaved(true);
  }

  const tier = matchTier(c.confidence);
  const tierClass =
    tier === "high" ? "shopping-match--high" : tier === "med" ? "shopping-match--med" : "shopping-match--low";

  const metaLine = [
    c.brand,
    RETAILER_LABELS[c.retailer] ?? c.retailer,
    c.color,
    ...(c.size ? [`Size ${c.size}`] : []),
    ...(c.price ? [`${c.price} ${c.currency}`] : []),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="shopping-card">
      <div className="shopping-card-main">
        <div className="shopping-card-title-row">
          <h3 className="shopping-card-title">{c.title}</h3>
          <span className={`shopping-match ${tierClass}`}>{Math.round(c.confidence * 100)}% match</span>
        </div>
        <p className="shopping-card-meta">{metaLine}</p>
      </div>
      <div className="shopping-card-actions">
        <button
          type="button"
          className={`shopping-icon-btn${saved ? " is-saved" : ""}`}
          title={saved ? "Saved to memories" : "Save to memories"}
          aria-label={saved ? "Saved to memories" : "Save to memories"}
          onClick={() => void handleSave()}
          disabled={saved}
        >
          {saved ? "✓" : "+"}
        </button>
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shopping-shop-link"
        >
          Search
        </a>
      </div>
    </article>
  );
}

function ShoppingFallback() {
  return (
    <main className="shopping-main">
      <p className="page-subtitle">Loading…</p>
    </main>
  );
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={<ShoppingFallback />}>
      <ShoppingPageContent />
    </Suspense>
  );
}
