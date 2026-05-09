import { CAL_INTEGRATION_PATH } from "@/lib/cal-integration-routes";

/**
 * Calls `POST ${CAL_INTEGRATION_PATH}/events` — Google Calendar `events.insert`.
 * Paths avoid `/google/` so fetch succeeds when privacy/browser tools block those URLs.
 */

export async function pushRecallEntryToGoogleCalendar(entryId: string): Promise<
  | { ok: true; htmlLink?: string }
  | { ok: false; code: "not_configured" | "not_connected" | "failed"; message?: string }
> {
  try {
    const res = await fetch(`${CAL_INTEGRATION_PATH}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
      credentials: "same-origin",
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      //
    }

    if (res.ok && data.ok === true) {
      return { ok: true, htmlLink: typeof data.htmlLink === "string" ? data.htmlLink : undefined };
    }

    const err = data.error;
    if (res.status === 501 || err === "not_configured") {
      return { ok: false, code: "not_configured" };
    }
    if (res.status === 428 || err === "not_connected") {
      return {
        ok: false,
        code: "not_connected",
        message: typeof data.message === "string" ? data.message : undefined,
      };
    }

    return {
      ok: false,
      code: "failed",
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch {
    const msg =
      "Could not reach Recall (blocked request or offline). Falling back to a calendar file.";
    return { ok: false, code: "failed", message: msg };
  }
}

/** Tries Google insert first; prompts for Settings or falls back to `.ics`. */
export async function addEntryToPreferredCalendar(entryId: string, icsHref: string): Promise<void> {
  try {
    const r = await pushRecallEntryToGoogleCalendar(entryId);

    if (r.ok) {
      if (r.htmlLink) {
        window.open(r.htmlLink, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (r.code === "not_connected") {
      const goSettings = window.confirm(
        "Connect Google Calendar in Settings so we can add events instantly.\n\nCancel downloads a calendar file (.ics) instead.",
      );
      if (goSettings) {
        window.location.href = "/settings#gcal-connect";
        return;
      }
    } else if (r.code === "failed" && r.message) {
      window.alert(`${r.message}\nTrying the downloadable calendar file instead.`);
    }

    window.location.href = icsHref;
  } catch {
    window.location.href = icsHref;
  }
}
