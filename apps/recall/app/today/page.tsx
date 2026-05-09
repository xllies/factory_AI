"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Entry } from "@/lib/types";
import { fetchEntries, updateEntry, deleteEntry } from "@/lib/client-store";
import { bucketForDue, relativeLabel } from "@/lib/datetime";
import { ensureNotificationPermission, scheduleAll, cancelAll } from "@/lib/reminders";

interface BucketedEntries {
  overdue: Entry[];
  now: Entry[];
  today: Entry[];
  tomorrow: Entry[];
  thisWeek: Entry[];
  later: Entry[];
  unscheduled: Entry[];
  recentMemories: Entry[];
}

function bucketEntries(entries: Entry[]): BucketedEntries {
  const now = new Date();
  const result: BucketedEntries = {
    overdue: [],
    now: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    unscheduled: [],
    recentMemories: [],
  };

  for (const e of entries) {
    if (e.type === "memory") {
      if (result.recentMemories.length < 6) result.recentMemories.push(e);
      continue;
    }
    if (e.done) continue;

    const bucket = bucketForDue(e.dueAt, now);
    if (!bucket) {
      result.unscheduled.push(e);
      continue;
    }
    switch (bucket) {
      case "Overdue": result.overdue.push(e); break;
      case "Now": result.now.push(e); break;
      case "Today": result.today.push(e); break;
      case "Tomorrow": result.tomorrow.push(e); break;
      case "This week": result.thisWeek.push(e); break;
      case "Later": result.later.push(e); break;
    }
  }

  const byDue = (a: Entry, b: Entry) => {
    const ta = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  };
  result.overdue.sort(byDue);
  result.now.sort(byDue);
  result.today.sort(byDue);
  result.tomorrow.sort(byDue);
  result.thisWeek.sort(byDue);
  result.later.sort(byDue);

  return result;
}

export default function TodayPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifyState, setNotifyState] = useState<NotificationPermission>("default");

  const refresh = useCallback(async () => {
    const fresh = await fetchEntries();
    setEntries(fresh);
    setLoading(false);
    scheduleAll(fresh);
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifyState(Notification.permission);
    }
    const interval = setInterval(refresh, 60_000);
    return () => {
      clearInterval(interval);
      cancelAll();
    };
  }, [refresh]);

  const buckets = useMemo(() => bucketEntries(entries), [entries]);

  async function toggleDone(entry: Entry) {
    const updated = entries.map((e) => (e.id === entry.id ? { ...e, done: !e.done } : e));
    setEntries(updated);
    await updateEntry(entry.id, { done: !entry.done });
  }

  async function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteEntry(id);
  }

  async function enableNotifications() {
    const perm = await ensureNotificationPermission();
    setNotifyState(perm);
    if (perm === "granted") scheduleAll(entries);
  }

  const hasAnyAction =
    buckets.overdue.length + buckets.now.length + buckets.today.length +
    buckets.tomorrow.length + buckets.thisWeek.length + buckets.later.length +
    buckets.unscheduled.length > 0;

  return (
    <main className="page-main">
      <div className="today-header">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">
            {loading
              ? "Loading…"
              : hasAnyAction
                ? "Here's what you said you'd do."
                : "Nothing is on your plate. Capture a thought to get started."}
          </p>
        </div>
        {notifyState !== "granted" && (
          <button className="secondary" onClick={() => void enableNotifications()}>
            🔔 Enable alarms
          </button>
        )}
      </div>

      <Section title="Overdue" tone="danger" entries={buckets.overdue}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="Right now" tone="accent" entries={buckets.now}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="Later today" entries={buckets.today}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="Tomorrow" entries={buckets.tomorrow}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="This week" entries={buckets.thisWeek}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="Later" entries={buckets.later}
        onToggle={toggleDone} onDelete={removeEntry} />
      <Section title="No date set" entries={buckets.unscheduled}
        onToggle={toggleDone} onDelete={removeEntry} muted />

      {buckets.recentMemories.length > 0 && (
        <section className="today-section">
          <h2 className="today-section-title">Recent memories</h2>
          <div className="today-memories">
            {buckets.recentMemories.map((m) => (
              <div key={m.id} className="memory-chip">
                <span className="memory-chip-icon">📌</span>
                <span>{m.summary}</span>
              </div>
            ))}
          </div>
          <Link href="/review" className="view-all">
            See all memories →
          </Link>
        </section>
      )}

      {!loading && !hasAnyAction && buckets.recentMemories.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎤</div>
          <p>Hold the mic on the Capture page and say something like:</p>
          <p style={{ fontStyle: "italic", color: "var(--text-soft)" }}>
            “Remind me to call mom tomorrow at 5pm.”
          </p>
          <Link href="/" className="view-all" style={{ marginTop: "1rem" }}>
            Go to Capture →
          </Link>
        </div>
      )}
    </main>
  );
}

interface SectionProps {
  title: string;
  tone?: "danger" | "accent";
  entries: Entry[];
  muted?: boolean;
  onToggle: (entry: Entry) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

function Section({ title, tone, entries, muted, onToggle, onDelete }: SectionProps) {
  if (entries.length === 0) return null;
  const toneClass = tone ? `today-section-${tone}` : "";

  return (
    <section className={`today-section ${toneClass} ${muted ? "today-section-muted" : ""}`}>
      <h2 className="today-section-title">
        {title} <span className="today-section-count">{entries.length}</span>
      </h2>
      <div className="today-list">
        {entries.map((entry) => (
          <ActionRow key={entry.id} entry={entry} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function ActionRow({ entry, onToggle, onDelete }: { entry: Entry; onToggle: (e: Entry) => void; onDelete: (id: string) => void }) {
  const due = entry.dueAt ? relativeLabel(entry.dueAt) : null;
  return (
    <div className={`action-row ${entry.done ? "action-row-done" : ""}`}>
      <label className="action-check">
        <input type="checkbox" checked={entry.done} onChange={() => onToggle(entry)} />
      </label>
      <div className="action-body">
        <p className="action-summary">{entry.summary}</p>
        <div className="action-meta">
          {due && <span className="action-due">⏰ {due}</span>}
          {entry.location && <span className="action-loc">📍 {entry.location}</span>}
          {entry.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
        </div>
      </div>
      <div className="action-side">
        {entry.dueAt && (
          <a
            className="ghost"
            href={`/api/calendar/event/${entry.id}.ics`}
            title="Download calendar event"
          >
            📅
          </a>
        )}
        <button className="ghost" onClick={() => onDelete(entry.id)} title="Delete">
          ✕
        </button>
      </div>
    </div>
  );
}
