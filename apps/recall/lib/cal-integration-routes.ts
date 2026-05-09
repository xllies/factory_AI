/** Next.js Route Handlers for Google Calendar OAuth + insert (`/api/cal-integration/**`). */

/** Prefer this segment over `/calendar/google/` — some privacy/ad tools block URLs containing `/google/` in-path. */
export const CAL_INTEGRATION_PATH = "/api/cal-integration";

/** If an older OAuth client registered this pathname, `/api/calendar/google/{auth,callback}` still works. */
export const LEGACY_GOOGLE_SEGMENT_CALLBACK_PATH = "/api/calendar/google/callback";
