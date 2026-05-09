/**
 * Shared Route Handler logic for Google Calendar OAuth start + callback (two pathname variants).
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import {
  googleCalendarOAuthConfigured,
  signGoogleCalendarOAuthState,
  verifyGoogleCalendarOAuthState,
} from "@/lib/google-calendar-oauth-state";
import { GOOGLE_CALENDAR_SCOPE, getGoogleCalendarOAuth2Client } from "@/lib/google-calendar-server";
import { env } from "@/lib/env";
import { publicOriginFromRequest } from "@/lib/request-origin";
import { getServiceSupabase, getUserSupabase } from "@/lib/supabase-server";

function redirect(origin: string, path: string) {
  return NextResponse.redirect(new URL(path, origin));
}

function concatOriginPath(origin: string, pathnameAbsolute: string) {
  return `${origin.replace(/\/+$/, "")}${pathnameAbsolute.startsWith("/") ? pathnameAbsolute : `/${pathnameAbsolute}`}`;
}

/**
 * Starts OAuth; pathname must equal the OAuth redirect pathname registered on Google Cloud
 * when this flow endpoint is invoked.
 *
 * Canonical: `CAL_INTEGRATION_PATH + "/callback"` (see `@/lib/cal-integration-routes`).
 */
export async function startGoogleCalendarOAuthRequest(
  request: Request,
  oauthCallbackPathnameAbsolute: string,
): Promise<Response> {
  if (!googleCalendarOAuthConfigured()) {
    return NextResponse.json({ error: "Google Calendar OAuth not configured on server" }, { status: 501 });
  }
  const db = await getUserSupabase();
  if (!db) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = env.GOOGLE_CALENDAR_CLIENT_SECRET!;
  const origin = publicOriginFromRequest(request);
  const redirectUri = concatOriginPath(origin, oauthCallbackPathnameAbsolute);

  const oauth2 = getGoogleCalendarOAuth2Client(redirectUri);
  const state = signGoogleCalendarOAuthState(user.id, secret);

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state,
  });

  return NextResponse.redirect(url);
}

export async function completeGoogleCalendarOAuthRequest(
  request: Request,
  oauthCallbackPathnameAbsolute: string,
): Promise<Response> {
  const origin = publicOriginFromRequest(request);

  if (!googleCalendarOAuthConfigured() || !env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    return redirect(origin, "/settings?gcal_error=config");
  }

  const reqUrl = new URL(request.url);
  if (reqUrl.searchParams.get("error")) {
    return redirect(origin, "/settings?gcal_error=oauth");
  }

  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const secret = env.GOOGLE_CALENDAR_CLIENT_SECRET;

  const userId = verifyGoogleCalendarOAuthState(state, secret);
  if (!userId || !code) {
    return redirect(origin, "/settings?gcal_error=state");
  }

  const redirectUri = concatOriginPath(origin, oauthCallbackPathnameAbsolute);
  let refreshToken: string | undefined;

  try {
    const oauth2 = getGoogleCalendarOAuth2Client(redirectUri);
    const { tokens } = await oauth2.getToken(code);
    refreshToken = tokens.refresh_token ?? undefined;

    oauth2.setCredentials(tokens);
    let email: string | null = null;
    try {
      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const info = await oauth2Api.userinfo.get();
      email = info.data.email ?? null;
    } catch {
      //
    }

    if (!refreshToken) {
      return redirect(origin, "/settings?gcal_error=no_refresh");
    }

    const service = getServiceSupabase();
    if (!service) {
      return redirect(origin, "/settings?gcal_error=server");
    }

    const { error } = await service
      .from("recall_google_calendar")
      .upsert({
        user_id: userId,
        refresh_token: refreshToken,
        email,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      return redirect(origin, "/settings?gcal_error=save");
    }
  } catch {
    return redirect(origin, "/settings?gcal_error=token");
  }

  return redirect(origin, "/settings?gcal_connected=1");
}
