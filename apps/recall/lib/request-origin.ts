import { env } from "@/lib/env";

/** Canonical public origin for OAuth redirects (matches calendar subscription links). */
export function publicOriginFromRequest(request: Request): string {
  if (env.APP_BASE_URL) {
    return env.APP_BASE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}
