"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadFeed() {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar/subscribe");
      const data = (await res.json()) as { feedUrl?: string; error?: string };
      if (data.feedUrl) setFeedUrl(data.feedUrl);
      if (data.error) setErrorMsg(data.error);
    } catch {
      setErrorMsg("Could not load calendar feed.");
    } finally {
      setLoading(false);
    }
  }

  async function rotate() {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/calendar/subscribe", { method: "POST" });
      if (!res.ok) throw new Error("rotate failed");
      await loadFeed();
    } catch {
      setErrorMsg("Could not rotate token.");
      setLoading(false);
    }
  }

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  return (
    <main className="page-main">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle" style={{ marginTop: "0.4rem" }}>
          Subscribe to your reminders from Google Calendar, Apple Calendar, or Outlook.
        </p>
      </div>

      <section className="settings-section">
        <h2 className="today-section-title">Calendar feed</h2>

        {loading && <p className="page-subtitle">Loading…</p>}

        {!loading && feedUrl && (
          <>
            <p className="page-subtitle">
              Copy this URL and paste it into Google Calendar → <em>Other calendars</em> → <em>From URL</em>
              {" "}(or Apple Calendar → <em>File → New Calendar Subscription</em>).
            </p>
            <div className="feed-url-row">
              <input
                className="text-input"
                readOnly
                value={feedUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={() => void copyFeed()}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <p className="page-subtitle" style={{ fontSize: "0.78rem" }}>
              Anyone with this URL can read your reminders, so treat it as private.
            </p>
            <button className="secondary" onClick={() => void rotate()} style={{ marginTop: "0.75rem" }}>
              Rotate URL (invalidates the old subscription)
            </button>
          </>
        )}

        {errorMsg && <p className="error-msg">{errorMsg}</p>}
      </section>
    </main>
  );
}
