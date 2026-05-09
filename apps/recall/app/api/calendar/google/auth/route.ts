/**
 * Legacy OAuth entry for Google Cloud setups that still list `/api/calendar/google/callback`
 * as redirect URI — prefer registering `/api/cal-integration/callback` and `/api/cal-integration/auth`.
 */
import { LEGACY_GOOGLE_SEGMENT_CALLBACK_PATH } from "@/lib/cal-integration-routes";
import { startGoogleCalendarOAuthRequest } from "@/lib/google-calendar-auth-handlers";

export async function GET(request: Request) {
  return startGoogleCalendarOAuthRequest(request, LEGACY_GOOGLE_SEGMENT_CALLBACK_PATH);
}
