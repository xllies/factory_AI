/**
 * Legacy OAuth callback path for older Google OAuth clients.
 */
import { LEGACY_GOOGLE_SEGMENT_CALLBACK_PATH } from "@/lib/cal-integration-routes";
import { completeGoogleCalendarOAuthRequest } from "@/lib/google-calendar-auth-handlers";

export async function GET(request: Request) {
  return completeGoogleCalendarOAuthRequest(request, LEGACY_GOOGLE_SEGMENT_CALLBACK_PATH);
}
