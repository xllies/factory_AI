# AI Bestie MVP

Memory-first companion app foundation for young professionals.

## 1) Install

From repository root:

```bash
npm install
```

## 2) Configure environment

Copy and fill:

```bash
cp apps/ai-bestie/.env.example apps/ai-bestie/.env.local
```

Minimum to run UI:
- `OPENAI_API_KEY` (optional; app falls back to non-model responses when missing)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Validate env from repo root:

```bash
npm run check:ai-bestie-env
```

## 3) Local Supabase (fresh setup with real data)

From `apps/ai-bestie/`:

```bash
supabase start
supabase db reset
```

`supabase db reset` applies all migrations in `supabase/migrations/` and loads `supabase/seed.sql`.

## 4) Run app

From `apps/ai-bestie/`:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## MVP slice implemented

- Onboarding snapshot UI (session state)
- Daily check-in form and API
- Memory capture and API
- Chat route with:
  - OpenAI response when `OPENAI_API_KEY` exists
  - deterministic fallback when key is missing
  - high-risk keyword guardrail response
- Supabase schema for profiles, conversations, messages, memory, check-ins, safety events, and calendar links.
