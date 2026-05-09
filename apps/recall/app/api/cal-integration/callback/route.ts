import { CAL_INTEGRATION_PATH } from "@/lib/cal-integration-routes";
import { completeGoogleCalendarOAuthRequest } from "@/lib/google-calendar-auth-handlers";

export async function GET(request: Request) {
  return completeGoogleCalendarOAuthRequest(request, `${CAL_INTEGRATION_PATH}/callback`);
}
