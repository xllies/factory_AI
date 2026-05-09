# Recall — voice-first personal assistant

Speak or type a thought. Recall classifies it as a **memory** to remember
or an **action** to do, extracts dates/locations, sets reminders, and exports
to your calendar.

> Status: MVP. Voice capture + AI classification + reminders + Google
> Calendar subscribe feed all working end-to-end. Email reminders and direct
> Google Calendar OAuth are scoped for the next iteration.

## Stack

- **Next.js 15** (App Router) on port `3001`
- **Supabase** for auth (magic link + Google OAuth) and Postgres storage with RLS
- **OpenAI** (`gpt-4o-mini`) for natural-language classification + date extraction
- **Web Speech API** for in-browser voice capture (no STT cost)
- **Notification API** for in-app alarms
- **`ics`** package for per-event downloads and a hosted iCalendar feed

Falls back gracefully when OpenAI or Supabase aren't configured: a regex
classifier handles common phrases and `localStorage` keeps your data on the
device.

## 1. Install

From the repo root:

```bash
npm install
```

## 2. Configure environment

Copy and fill the env template:

```bash
cp apps/recall/.env.example apps/recall/.env.local
```

Variables:

| Key | Required for | Notes |
|-----|--------------|-------|
| `OPENAI_API_KEY` | Smart classification & date parsing | Without it, falls back to a regex classifier |
| `OPENAI_MODEL` | (optional) | Defaults to `gpt-4o-mini` |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + cloud storage | From Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + cloud storage | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side calendar feed, future cron jobs | Keep this secret |

## 3. Provision Supabase

### a) Create the project

1. https://supabase.com → New project. Pick the region nearest you.
2. Settings → API. Copy the project URL, anon key, and service role key into `.env.local`.

### b) Run the migrations

Easiest path — paste each migration into the SQL editor in order:

1. `apps/recall/supabase/migrations/001_init_recall.sql`
2. `apps/recall/supabase/migrations/002_auth_and_reminders.sql`

Or, with the Supabase CLI:

```bash
cd apps/recall
supabase link --project-ref <your-ref>
supabase db push
```

### c) Enable Google sign-in (optional but recommended)

1. https://console.cloud.google.com → create a project.
2. APIs & Services → OAuth consent screen → External, fill in basics.
3. Credentials → Create OAuth client ID → Web application.
   - Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
4. Back in Supabase → Authentication → Providers → Google → paste the client ID and secret.
5. Authentication → URL Configuration → set Site URL to `http://localhost:3001` for dev (and your production URL when you deploy).

Magic-link email works out of the box once you confirm an email sender in Supabase.

## 4. Run

```bash
cd apps/recall
npm run dev
```

Open <http://localhost:3001>. You'll be redirected to `/login`.

## 5. Verify it works

- `/login` → magic link email arrives (check Supabase Auth → Logs if it doesn't).
- After signing in, you land on `/today`.
- `/` (Capture) → hold the mic, say *"remind me to call Sam tomorrow at 5pm"*.
  - The result card shows "⏰ Due in ~Xh" and an "Add to calendar" link.
  - The browser asks for notification permission. Allow it.
  - The reminder will pop up at the due time as long as the tab is open.
- `/today` shows the action under "Tomorrow" with an `.ics` download icon.
- `/settings` → copy the calendar feed URL into Google Calendar
  ("Other calendars" → "From URL"). Reminders sync within ~12h.

## Project structure

```
apps/recall/
├── app/
│   ├── page.tsx                 # Capture (voice + text)
│   ├── today/page.tsx           # Reminders dashboard
│   ├── upload/page.tsx          # Bulk import
│   ├── review/page.tsx          # All entries
│   ├── settings/page.tsx        # Calendar subscribe URL
│   ├── login/page.tsx
│   ├── auth/
│   │   ├── callback/route.ts    # OAuth + magic-link landing
│   │   └── signout/route.ts
│   └── api/
│       ├── classify/route.ts    # OpenAI classification + date extraction
│       ├── entries/route.ts     # CRUD with RLS
│       ├── health/route.ts
│       ├── calendar.ics/route.ts          # Hosted feed (token-auth)
│       └── calendar/
│           ├── subscribe/route.ts          # Mint/rotate the feed token
│           └── event/[id]/route.ts         # Per-event .ics download
├── lib/
│   ├── env.ts
│   ├── types.ts
│   ├── datetime.ts              # Heuristic date parser + bucketing
│   ├── ics.ts                   # iCalendar serialization
│   ├── reminders.ts             # Browser Notification scheduler
│   ├── client-store.ts          # Optimistic store + Supabase sync
│   ├── supabase-server.ts       # Service-role + user-scoped clients
│   └── supabase-browser.ts
├── middleware.ts                # Auth refresh + protected routes
└── supabase/
    └── migrations/
        ├── 001_init_recall.sql
        └── 002_auth_and_reminders.sql
```

## Roadmap (Stage 2)

- [ ] Email reminders via Resend + Vercel Cron (`/api/cron/reminders`)
- [ ] Google Calendar OAuth for instant 2-way sync (no `.ics` polling delay)
- [ ] PWA manifest + service worker so notifications fire when app is closed
- [ ] Voice transcription upgrade to OpenAI Whisper for better accuracy
- [ ] Memory recall via embeddings — *"what did I say about Sam last week?"*

## Troubleshooting

- **Sign-in works but every page bounces back to `/login`** — your Supabase Site URL is wrong. Fix it in Authentication → URL Configuration.
- **`Invalid token` on the calendar feed** — visit `/settings` and copy the URL again, or click "Rotate URL".
- **No `.ics` events showing in Google Calendar** — Google polls every 12–24 hours. Check the URL renders events directly in your browser first.
- **Notifications never fire** — they only work while the tab is open. PWA install + service worker is on the Stage 2 list.
