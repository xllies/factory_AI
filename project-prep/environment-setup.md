# AI Bestie Environment Setup

## Goal
Prepare a deterministic baseline environment before feature implementation.

## Local prerequisites
- Node.js 22 LTS
- npm 10+
- Git
- Supabase CLI
- Vercel CLI

## Accounts/access
- OpenAI API key
- Supabase project access
- Vercel project/team access
- PostHog project
- Resend domain + API key

## Baseline environment variables
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `RESEND_API_KEY`
- `APP_BASE_URL`

## Setup flow
1. Create `apps/ai-bestie/.env.local` from `apps/ai-bestie/.env.example`.
2. Validate environment variables with `node scripts/check-ai-bestie-env.mjs`.
3. Run local app/tool smoke checks once scaffold is present.

## Notes
- Never commit real secrets.
- Keep environment validation script and `.env.example` aligned.
