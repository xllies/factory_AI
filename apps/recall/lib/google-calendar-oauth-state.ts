import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const TTL_MS = 15 * 60_000;

interface StatePayload {
  u: string;
  e: number;
  /** random so two states for the same window differ */
  n: string;
}

export function googleCalendarOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

export function signGoogleCalendarOAuthState(userId: string, secret: string): string {
  const payload: StatePayload = {
    u: userId,
    e: Date.now() + TTL_MS,
    n: randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns authenticated user id or null when state is invalid or expired. */
export function verifyGoogleCalendarOAuthState(state: string | null, secret: string): string | null {
  if (!state) return null;
  const dot = state.indexOf(".");
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (typeof payload.u !== "string" || typeof payload.e !== "number") return null;
    if (payload.e < Date.now()) return null;
    return payload.u;
  } catch {
    return null;
  }
}
