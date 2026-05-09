import { google } from "googleapis";
import type { Entry } from "@/lib/types";
import { env } from "@/lib/env";

/** Create / update events without full calendar scope. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function getGoogleCalendarOAuth2Client(redirectUri: string) {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    throw new Error("Google Calendar OAuth is not configured");
  }
  return new google.auth.OAuth2(env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET, redirectUri);
}

/** Default event length when Recall only knows a due instant (matches .ics helpers). */
const DEFAULT_DURATION_MS = 30 * 60_000;

function remindersFor(entry: Entry) {
  if (!entry.remindAt || !entry.dueAt) {
    return { useDefault: true as const };
  }
  const minutesBefore = Math.max(
    0,
    Math.round((new Date(entry.dueAt).getTime() - new Date(entry.remindAt).getTime()) / 60_000),
  );
  return {
    useDefault: false as const,
    overrides: [{ method: "popup" as const, minutes: minutesBefore }],
  };
}

/** Inserts event into user's primary calendar. Returns Google's event payload. */
export async function insertRecallEntryIntoGoogleCalendar(
  refreshToken: string,
  entry: Entry,
  timeZone: string,
): Promise<{ id: string; htmlLink?: string | null }> {
  const id = env.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!id?.length || !secret?.length) {
    throw new Error("Google Calendar OAuth env missing");
  }
  const oauth2 = new google.auth.OAuth2(id, secret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const startIso = entry.dueAt;
  if (!startIso) {
    throw new Error("entry has no due date");
  }
  const startMs = new Date(startIso).getTime();
  const endIso = new Date(startMs + DEFAULT_DURATION_MS).toISOString();

  const reminders = remindersFor(entry);
  const inserted = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: entry.summary,
      description: entry.raw?.length ? entry.raw : undefined,
      location: entry.location ?? undefined,
      status: entry.done ? "cancelled" : "confirmed",
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
      reminders,
      extendedProperties: {
        private: {
          recallEntryId: entry.id,
        },
      },
    },
  });

  return { id: inserted.data.id ?? "", htmlLink: inserted.data.htmlLink };
}
