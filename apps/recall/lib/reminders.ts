"use client";

import type { Entry } from "@/lib/types";
import { updateEntry } from "@/lib/client-store";

/**
 * Schedules in-browser notifications for upcoming reminders.
 *
 * We use plain setTimeout (not the Notification trigger API which is
 * Chromium-only and behind a flag) — this means alarms fire only while the
 * tab is open or the PWA is running. For background reminders we'll add
 * email via Resend in Stage 2.
 */

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

/** Ask the user once for permission. Safe to call repeatedly. */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function fire(entry: Entry): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = entry.type === "action" ? "⏰ Reminder" : "📌 Recall";
  const body = entry.summary;
  const tag = `recall-${entry.id}`;

  try {
    const n = new Notification(title, { body, tag, requireInteraction: true });
    n.onclick = () => {
      window.focus();
      window.location.assign("/today");
      n.close();
    };
  } catch {
    // Some browsers throw on construction; ignore.
  }

  void updateEntry(entry.id, { notifiedAt: new Date().toISOString() });
}

/**
 * Schedule a reminder for a single entry. Idempotent — calling twice with
 * the same entry just re-arms the timer.
 */
export function scheduleReminder(entry: Entry): void {
  cancelReminder(entry.id);

  if (entry.done) return;
  if (entry.notifiedAt) return;
  const target = entry.remindAt ?? entry.dueAt;
  if (!target) return;

  const delay = new Date(target).getTime() - Date.now();
  // setTimeout caps around 24.8 days; if the reminder is further out we just
  // skip and rely on the next page load to schedule it.
  if (delay > 24 * 60 * 60 * 1000) return;

  if (delay <= 0) {
    fire(entry);
    return;
  }

  const handle = setTimeout(() => {
    scheduled.delete(entry.id);
    fire(entry);
  }, delay);
  scheduled.set(entry.id, handle);
}

export function cancelReminder(id: string): void {
  const existing = scheduled.get(id);
  if (existing) {
    clearTimeout(existing);
    scheduled.delete(id);
  }
}

export function scheduleAll(entries: Entry[]): void {
  for (const e of entries) scheduleReminder(e);
}

export function cancelAll(): void {
  for (const handle of scheduled.values()) clearTimeout(handle);
  scheduled.clear();
}
