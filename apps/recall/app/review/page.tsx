"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Entry } from "@/lib/types";
import { fetchEntries, updateEntry, deleteEntry } from "@/lib/client-store";
import { relativeLabel } from "@/lib/datetime";
import { addEntryToPreferredCalendar } from "@/lib/google-calendar-push";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Tab = "all" | "memory" | "action" | "shopping";

const TAB_LABELS: Record<Tab, string> = {
  all: "All",
  memory: "📌 Memories",
  action: "✅ Actions",
  shopping: "🛍️ Shopping",
};

const BADGE_LABELS: Record<string, string> = {
  memory: "📌 Memory",
  action: "✅ Action",
  shopping: "🛍️ Shopping",
};

export default function ReviewPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setEntries(await fetchEntries());
      setLoading(false);
    })();
  }, []);

  async function toggleDone(id: string) {
    const target = entries.find((e) => e.id === id);
    if (!target) return;
    const next = !target.done;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, done: next } : e)));
    await updateEntry(id, { done: next });
  }

  async function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteEntry(id);
  }

  function toggleRaw(id: string) {
    setShowRaw((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const filtered = entries.filter((e) => tab === "all" || e.type === tab);
  const memCount = entries.filter((e) => e.type === "memory").length;
  const actionCount = entries.filter((e) => e.type === "action").length;
  const shopCount = entries.filter((e) => e.type === "shopping").length;

  const EMPTY_ICON: Record<Tab, string> = {
    all: "📋", memory: "📌", action: "✅", shopping: "🛍️",
  };

  return (
    <main className="review-main">
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Review</h1>
        <p style={{ fontSize: "0.9rem", color: "var(--text-soft)", marginTop: "0.4rem" }}>
          {loading
            ? "Loading…"
            : [
                `${entries.length} total`,
                memCount ? `${memCount} memories` : null,
                actionCount ? `${actionCount} actions` : null,
                shopCount ? `${shopCount} shopping` : null,
              ].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="review-tabs">
        {(["all", "memory", "action", "shopping"] as Tab[]).map((t) => (
          <button key={t} className={`review-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{EMPTY_ICON[tab]}</div>
          <p>
            {entries.length === 0
              ? "Nothing captured yet. Head to Capture to get started."
              : `No ${tab === "all" ? "entries" : tab + (tab === "shopping" ? " entries" : "s")} yet.`}
          </p>
        </div>
      ) : (
        <div className="entries-grid">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={`entry-card ${entry.type} ${entry.done ? "done-card" : ""}`}
            >
              <div className="entry-header">
                <span className={`entry-badge ${entry.type}`}>
                  {BADGE_LABELS[entry.type] ?? entry.type}
                </span>
                <span className="entry-date">{formatDate(entry.createdAt)}</span>
              </div>

              <p className="entry-summary" style={{ textDecoration: entry.done ? "line-through" : "none" }}>
                {entry.summary}
              </p>

              {entry.dueAt && (
                <p className="entry-meta">
                  ⏰ {relativeLabel(entry.dueAt)} ·{" "}
                  {new Date(entry.dueAt).toLocaleString(undefined, {
                    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </p>
              )}
              {entry.location && <p className="entry-meta">📍 {entry.location}</p>}

              {showRaw[entry.id] && (
                <p className="entry-raw">&ldquo;{entry.raw}&rdquo;</p>
              )}

              {entry.tags.length > 0 && (
                <div className="result-tags">
                  {entry.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}
                </div>
              )}

              <div className="entry-footer">
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {entry.type === "action" && (
                    <label className="done-toggle">
                      <input
                        type="checkbox"
                        checked={entry.done}
                        onChange={() => void toggleDone(entry.id)}
                      />
                      Done
                    </label>
                  )}
                  {entry.type === "shopping" && (
                    <Link
                      className="ghost"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                      href={`/shopping?q=${encodeURIComponent(entry.raw)}`}
                    >
                      🔍 Find products
                    </Link>
                  )}
                  <button
                    className="ghost"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                    onClick={() => toggleRaw(entry.id)}
                  >
                    {showRaw[entry.id] ? "Hide original" : "Show original"}
                  </button>
                  {entry.dueAt && entry.type !== "shopping" && (
                    <button
                      type="button"
                      className="ghost"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                      onClick={() =>
                        void addEntryToPreferredCalendar(entry.id, `/api/calendar/event/${entry.id}.ics`)}
                    >
                      📅 Calendar
                    </button>
                  )}
                </div>
                <button
                  className="danger"
                  style={{ fontSize: "0.75rem", padding: "0.2rem 0.55rem" }}
                  onClick={() => void removeEntry(entry.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
