import { z } from "zod";

/**
 * Treat empty strings the same as missing — common when a user copies
 * .env.example and leaves keys blank. Without this, an empty
 * NEXT_PUBLIC_SUPABASE_URL fails .url() validation and crashes startup.
 */
const empty = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Public URL of the app (no trailing slash). Fixes calendar feed links when `Host` / reverse-proxy URL ≠ the URL pasted into Google Calendar. */
  APP_BASE_URL: z.string().url().optional(),
});

export const env = schema.parse({
  OPENAI_API_KEY: empty(process.env.OPENAI_API_KEY),
  OPENAI_MODEL: empty(process.env.OPENAI_MODEL),
  NEXT_PUBLIC_SUPABASE_URL: empty(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: empty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: empty(process.env.SUPABASE_SERVICE_ROLE_KEY),
  APP_BASE_URL: empty(process.env.APP_BASE_URL),
});
