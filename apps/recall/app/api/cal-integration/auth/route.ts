import { CAL_INTEGRATION_PATH } from "@/lib/cal-integration-routes";
import { startGoogleCalendarOAuthRequest } from "@/lib/google-calendar-auth-handlers";

/**
 * Canonical OAuth entry: register redirect `{origin}${CAL_INTEGRATION_PATH}/callback` in Google Cloud.
 */
export async function GET(request: Request) {
  return startGoogleCalendarOAuthRequest(request, `${CAL_INTEGRATION_PATH}/callback`);
}
