"use client";

import { useEffect, useState } from "react";

interface GcalStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
}

export default function SettingsPage() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [gcal, setGcal] = useState<GcalStatus | null>(null);
  const [gcalBanner, setGcalBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

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

  async function loadGcal(): Promise<GcalStatus | null> {
    try {
      const res = await fetch("/api/cal-integration");
      const data = (await res.json()) as GcalStatus | { error?: string };
      if (!res.ok) {
        setGcal({ configured: false, connected: false });
        return null;
      }
      setGcal(data as GcalStatus);
      return data as GcalStatus;
    } catch {
      setGcal({ configured: false, connected: false });
      return null;
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
    } catch {
      //
    }
  }

  async function disconnectGoogle() {
    const res = await fetch("/api/cal-integration", { method: "DELETE" });
    if (res.ok) {
      await loadGcal();
      setGcalBanner({ tone: "ok", text: "Disconnected from Google Calendar." });
    }
  }

  useEffect(() => {
    void loadFeed();
    let text: string | null = null;
    let tone: "ok" | "err" = "err";

    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      const errCode = u.searchParams.get("gcal_error");
      const ok = u.searchParams.get("gcal_connected");

      if (ok) {
        tone = "ok";
        text = "Google Calendar connected.";
      } else if (errCode) {
        tone = "err";
        switch (errCode) {
          case "oauth":
            text = "Google sign-in did not finish. Try connecting again.";
            break;
          case "no_refresh":
            text = "Google did not issue a refresh token. Remove Recall from your Google Account’s app access once, then try again.";
            break;
          case "state":
            text = "The authorization link expired. Start connect again.";
            break;
          case "config":
          case "server":
            text = "Server could not finish setup. Ask the admin to check env and migrations.";
            break;
          default:
            text = "Could not finish Google authorization. Try again.";
        }
      }

      let changed = false;
      ["gcal_error", "gcal_connected"].forEach((k) => {
        if (u.searchParams.has(k)) {
          u.searchParams.delete(k);
          changed = true;
        }
      });
      if (changed) {
        window.history.replaceState({}, "", `${u.pathname}${u.hash}`);
      }

      if (text) setGcalBanner({ tone, text });
    }

    void loadGcal();
  }, []);

  return (
    <main className="page-main">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle" style={{ marginTop: "0.4rem" }}>
          Subscribe to your reminders from Google Calendar, Apple Calendar, or Outlook.
        </p>
      </div>

      <section id="gcal-connect" className="settings-section">
        <h2 className="today-section-title">Google Calendar</h2>

        {!gcal && <p className="page-subtitle">Loading Google status…</p>}

        {gcalBanner && (
          <p className={`page-subtitle ${gcalBanner.tone === "err" ? "error-msg" : ""}`} style={gcalBanner.tone === "ok" ? { color: "var(--accent, #0a84ff)" } : undefined}>
            {gcalBanner.text}
          </p>
        )}

        {gcal && !gcal.configured && (
          <p className="page-subtitle">
            One-tap inserts are off until the deploy sets{" "}
            <code style={{ fontSize: "0.85em" }}>GOOGLE_CALENDAR_CLIENT_ID</code>{" "}
            and <code style={{ fontSize: "0.85em" }}>GOOGLE_CALENDAR_CLIENT_SECRET</code>
            {" "}and registers redirect URI{" "}
            <code style={{ fontSize: "0.85em" }}>…/api/cal-integration/callback</code>.
          </p>
        )}

        {gcal && gcal.configured && !gcal.connected && (
          <>
            <p className="page-subtitle">
              Connect once so Recall can create events directly in your Google Calendar (scoped to creating events).
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/cal-integration/auth";
              }}
            >
              Connect Google Calendar
            </button>
          </>
        )}

        {gcal && gcal.configured && gcal.connected && (
          <>
            <p className="page-subtitle">
              Signed in
              {typeof gcal.email === "string" && gcal.email.length > 0 ? ` as ${gcal.email}` : ""}.
            </p>
            <button type="button" className="secondary" onClick={() => void disconnectGoogle()}>
              Disconnect Google Calendar
            </button>
          </>
        )}
      </section>

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
