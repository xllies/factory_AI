/**
 * Lightweight natural-language datetime parser used as a fallback when
 * the OpenAI classifier is unavailable. Handles the most common phrases
 * a personal assistant hears: "tomorrow at 5pm", "in 30 minutes",
 * "next monday", "tonight", etc. Anything ambiguous returns null.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

interface ParseContext {
  /** Reference time the parser anchors relative phrases to. */
  now: Date;
  /** IANA timezone of the user, e.g. "Europe/Athens". */
  timezone: string;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function withTime(d: Date, hours: number, minutes: number): Date {
  const c = new Date(d);
  c.setHours(hours, minutes, 0, 0);
  return c;
}

function parseClockPhrase(text: string): { hours: number; minutes: number } | null {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    ?? text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] ?? "").toLowerCase();

  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function parseDueAt(text: string, ctx: ParseContext): Date | null {
  const lower = text.toLowerCase();
  const now = ctx.now;

  // Relative offsets: "in 30 minutes", "in 2 hours", "in 3 days"
  const relMatch = lower.match(/\bin\s+(\d{1,3})\s+(minute|min|hour|hr|day|week)s?\b/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const ms =
      unit.startsWith("min") ? n * 60_000 :
      unit.startsWith("hour") || unit === "hr" ? n * 3_600_000 :
      unit.startsWith("day") ? n * 86_400_000 :
      unit.startsWith("week") ? n * 7 * 86_400_000 :
      0;
    if (ms > 0) return new Date(now.getTime() + ms);
  }

  const clock = parseClockPhrase(lower);
  const today = startOfDay(now);

  // "tonight" → today at 20:00 (or the explicit time if given)
  if (/\btonight\b/.test(lower)) {
    return clock ? withTime(today, clock.hours, clock.minutes) : withTime(today, 20, 0);
  }

  // "tomorrow [at HH:MM]" → next day, defaulting to 9am
  if (/\btomorrow\b/.test(lower)) {
    const day = new Date(today.getTime() + 86_400_000);
    return clock ? withTime(day, clock.hours, clock.minutes) : withTime(day, 9, 0);
  }

  // "today at HH:MM" / "later today"
  if (/\btoday\b/.test(lower) && clock) {
    return withTime(today, clock.hours, clock.minutes);
  }

  // "next monday", "on friday", "this thursday"
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b(?:next|on|this)?\\s*${WEEKDAYS[i]}\\b`);
    if (re.test(lower)) {
      const todayDow = today.getDay();
      let delta = (i - todayDow + 7) % 7;
      if (delta === 0 || /\bnext\b/.test(lower)) delta = delta === 0 ? 7 : delta;
      const day = new Date(today.getTime() + delta * 86_400_000);
      return clock ? withTime(day, clock.hours, clock.minutes) : withTime(day, 9, 0);
    }
  }

  // Bare clock time → assume today if still in the future, else tomorrow
  if (clock) {
    const candidate = withTime(today, clock.hours, clock.minutes);
    if (candidate.getTime() > now.getTime()) return candidate;
    return new Date(candidate.getTime() + 86_400_000);
  }

  return null;
}

/** Format an ISO timestamp into a friendly relative label. */
export function relativeLabel(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  const future = diff > 0;

  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;

  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface DueBucket {
  label: "Overdue" | "Now" | "Today" | "Tomorrow" | "This week" | "Later";
}

export function bucketForDue(iso: string | null, now: Date = new Date()): DueBucket["label"] | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const diff = t - now.getTime();

  if (diff < -5 * 60_000) return "Overdue";
  if (diff < 30 * 60_000) return "Now";

  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const dayAfter = new Date(today.getTime() + 2 * 86_400_000);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const due = new Date(iso);

  if (due < tomorrow) return "Today";
  if (due < dayAfter) return "Tomorrow";
  if (due < weekEnd) return "This week";
  return "Later";
}
