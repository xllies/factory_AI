import { createEvent, createEvents, type EventAttributes, type DateArray } from "ics";
import type { Entry } from "@/lib/types";

function toDateArray(iso: string): DateArray {
  const d = new Date(iso);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

function entryToEvent(entry: Entry): EventAttributes | null {
  if (!entry.dueAt) return null;
  const start = toDateArray(entry.dueAt);

  return {
    uid: `recall-${entry.id}@recall.app`,
    title: entry.summary,
    description: entry.raw,
    start,
    startInputType: "utc",
    duration: { hours: 0, minutes: 30 },
    location: entry.location ?? undefined,
    categories: entry.tags,
    status: entry.done ? "CANCELLED" : "CONFIRMED",
    alarms: entry.remindAt
      ? [{
          action: "display",
          description: entry.summary,
          trigger: triggerOffsetFromTarget(entry.dueAt, entry.remindAt),
        }]
      : undefined,
  };
}

/** ICS triggers are offsets relative to the event start. */
function triggerOffsetFromTarget(dueAt: string, remindAt: string) {
  const minutesBefore = Math.max(
    0,
    Math.round((new Date(dueAt).getTime() - new Date(remindAt).getTime()) / 60_000),
  );
  return { minutes: minutesBefore, before: true };
}

export function entryToIcs(entry: Entry): string | null {
  const event = entryToEvent(entry);
  if (!event) return null;
  const { error, value } = createEvent(event);
  if (error || !value) return null;
  return value;
}

export function entriesToIcs(entries: Entry[]): string {
  const events = entries
    .map(entryToEvent)
    .filter((e): e is EventAttributes => e !== null);

  const emptyCalendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recall//EN",
    "CALSCALE:GREGORIAN",
    "END:VCALENDAR",
  ].join("\r\n");

  if (events.length === 0) {
    return emptyCalendar;
  }

  const { error, value } = createEvents(events);
  if (error || !value) {
    return emptyCalendar;
  }
  return value;
}
