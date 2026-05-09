# AI Bestie App - Project Preparation Bundle

## 1) Concept Restatement

- One-sentence summary: `AI Bestie` is a companion app for young professionals with deep personal memory management, daily reflection support, and a path to calendar-aware assistance.
- Target users: young professionals who want low-friction daily emotional support, memory continuity, and practical planning help.
- Problem being solved: existing journaling and productivity apps are often cold, generic, or high-friction; users want a consistent "always there" companion experience.
- Desired outcome: users open the app daily, complete short chat/reflection loops, trust the assistant to remember important context, and report improved clarity and follow-through.
- What this project is not: not therapy, not emergency mental-health care, not clinical diagnosis, and not a social network MVP.

## 2) Success Criteria

### User-facing
- First-time user can sign up and complete onboarding in <3 minutes.
- User can chat with AI bestie with sub-3s median response latency for text.
- User receives personalized daily check-in prompt and can respond in one tap.
- User can review memory timeline (key facts/goals/mood trends) without editing raw databases.

### Technical
- 99%+ successful request rate for chat APIs in staging load tests.
- No critical security findings: no secret leakage, no unsafe auth patterns, no open RLS gaps.
- Reproducible local setup from README (install, migrate/reset, seed, run, test).
- Observability covers: auth failures, model errors, latency percentile, daily active users.

### Business/personal
- Day-7 retention target for MVP cohort: >=20%.
- 30%+ of onboarded users complete at least 3 check-ins in first week.
- Cost target: keep blended AI cost under $0.08 per daily active user/day in MVP.

### Evaluation plan
- Instrument onboarding funnel, check-in completion, session length, response latency, and AI cost/user.
- Weekly review of retention and cost metrics.
- Biweekly user interviews (5 users/sprint) for qualitative trust/safety feedback.

## 3) Discovery Notes

### What we know
- Existing repo is a Node/TypeScript automation project (`dark_factory`) with tests and workflow scaffolding, not a shipped end-user app.
- The project has strong process infrastructure (Jira dispatch, transcript artifacts, stage docs patterns).

### What we assume (working assumptions)
- MVP platform: native-first product direction; implementation starts with backend/domain foundations that support mobile clients.
- MVP geography: single region deployment.
- MVP monetization: free during validation (no paywall in MVP).
- AI interaction starts as text-first with robust memory management for user thoughts and saved context.

### What we need to research next
- Legal/safety boundaries by target market.
- Exact model/provider choice under your cost/quality target.
- Memory policy (what is stored, for how long, and deletion UX).

### Highest-risk unknowns
- Safety scope (what content must be blocked/escalated).
- Privacy expectations and data retention requirements.
- Response quality vs cost tradeoff for conversational experience.

### Blocker questions (only true blockers)
- See final section "PREP GATE" for blocker questions needed before implementation.

## 4) Scope

### MVP scope
- Authenticated users can chat with AI bestie (text).
- Persistent conversation history and structured memory (goals/preferences/check-in summaries).
- Daily check-in prompts and lightweight mood tracking.
- Memory management for thought capture and efficient retrieval (summaries + structured memory items).
- Basic profile settings, data export trigger, and account deletion flow.
- Admin-less analytics dashboard via PostHog.

### V1 scope
- Push notifications (mobile), richer memory controls, streaks, weekly summary cards.
- Calendar appointment integration and related personal-data connectors.
- Voice input/output.
- Optional paid tier and usage limits.

### Later/backlog
- Multi-agent personas.
- Group mode / shared challenges.
- Marketplace/community content.

### Explicit non-goals
- Clinical therapy claims.
- Real-time crisis intervention automation.
- B2B/admin console in MVP.

## 5) Tool And Stack Research (Decision Matrix)

| Category | Recommended | Alternatives | Why this choice | Tradeoffs | Setup complexity | Maint risk | Cost/pricing risk | Sources |
|---|---|---|---|---|---|---|---|---|
| App/runtime framework | Next.js (App Router) | Remix, SvelteKit | Mature full-stack React flow, strong docs for auth/testing/deployment, fast path to PWA | React/Next complexity for new devs | Medium | Low-Med | Low | [Next.js App Guides](https://nextjs.org/docs/app/guides) |
| UI/design | Tailwind + shadcn/ui | Chakra, MUI | Fast composition, design consistency without heavy runtime | Requires design discipline | Low-Med | Low | Low | [Next.js Tailwind Guide](https://nextjs.org/docs/app/guides/tailwind-v3-css) |
| Database/storage/auth | Supabase (Postgres + Auth + Storage) | Firebase, Neon+Clerk | Unified stack reduces integration burden; SQL + RLS supports durable memory features | Need careful RLS and migration discipline | Medium | Medium | Medium | [Supabase pricing/docs](https://supabase.com/docs/pricing) |
| LLM provider | OpenAI API (primary) + abstraction seam for fallback | Anthropic-only | Matches explicit preference while retaining an escape hatch via provider abstraction | Added implementation overhead for abstraction layer | Medium | Medium | Medium | [OpenAI API pricing](https://openai.com/api/pricing/), [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) |
| Email/notifications | Resend | SendGrid, Postmark | Simple DX and clear transactional pricing for MVP volume | Daily limits on free tier | Low | Low | Low-Med | [Resend pricing](https://resend.com/pricing) |
| Hosting/deployment | Vercel | Cloudflare, Fly.io | Best default fit for Next.js with low ops overhead | Hobby plan not for commercial production | Low | Low | Medium | [Vercel pricing](https://vercel.com/pricing) |
| Analytics | PostHog Cloud | Plausible, Mixpanel | Generous free tier, product analytics + experiments + session replay | Event costs can scale if unchecked | Low | Low-Med | Medium | [PostHog pricing](https://posthog.com/pricing) |
| Testing | Vitest + Testing Library + Playwright | Jest+Cypress | Fast unit/integration + robust browser E2E | Extra test harness maintenance | Medium | Medium | Low | [Next.js testing guide](https://nextjs.org/docs/app/guides/testing) |
| Automation/PM | Existing Dark Factory workflows + Jira | Manual PM docs only | Repo already optimized for plan/apply/workflow continuity | Must keep docs/transcripts fresh | Medium | Medium | Low | [Atlassian Project Poster](https://www.atlassian.com/team-playbook/plays/project-poster), [Double Diamond](https://www.designcouncil.org.uk/resources/framework-for-innovation/) |

Recommended stack summary:
- `Next.js + Supabase + OpenAI + Vercel + PostHog + Resend` gives fastest MVP with manageable ops and strong docs.

## 6) Two Skills Per Selected Tool

### nextjs
- `nextjs-setup`
  - Trigger: when creating/upgrading/running the app scaffold, env config, local dev, or deployment prep.
  - Job: initialize app, verify scripts, configure env, run smoke/test/build checks.
  - References/assets: Next docs links, local script snippets for `dev/build/test`.
  - Validation: app boots, env vars resolved, build/test pass, preview deploy succeeds.
  - Example triggers: "init frontend", "fix next build issue", "set up local app runtime".
- `nextjs-build`
  - Trigger: when implementing routes, server actions, API handlers, caching/revalidation, auth guards.
  - Job: implement project patterns, prevent anti-patterns, troubleshoot runtime/rendering issues.
  - Validation: route works, SSR/CSR behavior as expected, Playwright path passes.

### supabase
- `supabase-setup`
  - Trigger: when configuring Supabase project/CLI/local env/migrations/seeds/auth providers.
  - Job: setup project, configure keys safely, run migrate/reset/seed + health checks.
  - Validation: migrations apply cleanly, seed data present, auth+db connectivity verified.
  - Example triggers: "connect db", "create migration baseline", "set up supabase locally".
- `supabase-build`
  - Trigger: when implementing schema, RLS, auth flows, storage policies, SQL performance changes.
  - Job: implement secure tables/policies/functions with project-specific conventions.
  - Validation: RLS tests, role checks, SQL explain on heavy queries, API route integration check.

### openai
- `openai-setup`
  - Trigger: configuring model access, keys, request wrappers, retry/timeouts.
  - Job: set env/config, smoke test model call, verify cost logging.
  - Validation: successful non-empty response, tracked tokens/cost, fallback path covered.
- `openai-build`
  - Trigger: prompt templates, conversation orchestration, memory summarization, safety guardrails.
  - Job: implement AI interaction layer with prompt/version discipline and failure handling.
  - Validation: response quality spot-check, refusal policy tests, latency/cost thresholds.

### vercel
- `vercel-setup`
  - Trigger: deployment/project linking/env syncing.
  - Job: configure project, env vars, preview + production flow.
  - Validation: preview deploy works, env vars present, health endpoint green.
- `vercel-build`
  - Trigger: optimization, runtime config, deployment incidents.
  - Job: tune build/runtime behavior, debug logs, rollback and recovery runbook.
  - Validation: stable deploy, acceptable p95 latency, no regressions after rollout.

### posthog
- `posthog-setup`
  - Trigger: enabling analytics/events/session replay with privacy controls.
  - Job: set SDK, define event taxonomy, confirm ingestion.
  - Validation: key funnel events arriving and queryable within expected delay.
- `posthog-build`
  - Trigger: analytics QA, funnel analysis, retention dashboards, instrumentation fixes.
  - Job: maintain event quality, dashboard templates, and experiment wiring.
  - Validation: event contracts pass, metrics align with app behavior.

### resend
- `resend-setup`
  - Trigger: outbound email domain/auth configuration and integration.
  - Job: configure domain, API key, sender identity, and smoke send.
  - Validation: message delivered, SPF/DKIM healthy, bounce handling verified.
- `resend-build`
  - Trigger: implementing notification templates and operational email workflows.
  - Job: build templates, trigger rules, retries, and diagnostics.
  - Validation: templated emails render, logs show success/failure handling.

### Cross-cutting skills
- `ai-bestie-pm`
  - Owns stage plan, gate checks, scope control, commit discipline, handover protocol.
- `docs-freshness`
  - Verifies docs mirror real repo/setup/tests and blocks stale guidance.
- `wellbeing-domain`
  - Encodes non-clinical language rules, safety boundaries, persona consistency, trust heuristics.

## 7) Architecture And Workflow

### High-level architecture
- Next.js frontend/server routes.
- Supabase for auth, relational memory store, and storage.
- AI service layer abstracting model provider calls.
- Event tracking to PostHog.
- Email notifications via Resend.
- Vercel deployment (preview + production).

### Main user flows
1. Onboard -> choose goals/persona -> first check-in.
2. Daily check-in -> AI response -> memory update.
3. Open chat anytime -> personalized response using memory summary.
4. Account settings -> export/delete data.

### Information model (MVP)
- `users`, `profiles`, `conversations`, `messages`, `memory_items`, `memory_summaries`, `checkins`, `calendar_links`, `safety_events`.

### External integrations
- OpenAI API (chat generation).
- Supabase (auth/db/storage).
- PostHog (analytics).
- Resend (emails).

### Security/privacy notes
- No secrets in client bundle; server-only keys for model/provider access.
- RLS enforced on all user-owned tables.
- Safety classifier/rules for self-harm and prohibited content, with clear escalation text.
- Data retention and deletion policy explicitly documented in product copy.

### Deployment/environment plan
- Environments: local, preview, production.
- CI gate: typecheck + lint + tests + basic E2E.
- Feature flags for risky UX/safety changes.

## 8) Implementation Plan

### Milestones
1. Foundation and repo scaffold.
2. Auth + profile + base data model.
3. Chat core + memory write/read.
4. Daily check-ins + analytics.
5. Safety layer + policy UX.
6. QA hardening + launch docs.

### Ordered tasks (with dependencies)
- M1: scaffold app, env contracts, test harness, CI checks.
- M2: implement auth/onboarding/profile tables and RLS (depends M1).
- M3: AI chat route, prompt templates, memory summarizer worker (depends M2).
- M4: check-in scheduler + reminder email + analytics events (depends M3).
- M5: moderation rules + crisis copy + incident telemetry (depends M3/M4).
- M6: docs freshness pass, runbook, and handover artifacts (depends all).

### Acceptance criteria per milestone
- Each milestone has explicit L1-L4 QA pass and docs freshness pass before done.

### Test/verification plan
- L1: lint/type/unit.
- L2: route/component correctness + accessibility basics.
- L3: auth->db->ai integration checks.
- L4: browser E2E for onboarding, chat, check-in, and settings.

## 9) Clean Start Checklist

### Files/docs to create before coding
- `project-prep/` docs (this bundle + linked docs).
- `DECISIONS.md`.
- `.env.example` with required vars.
- `docs/qa/` evidence template.

### Environment variables (initial)
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- `RESEND_API_KEY`
- `APP_BASE_URL`

### Repo setup steps
- Install deps.
- Initialize app workspace.
- Configure lint/type/test scripts.
- Create baseline migration + seed.
- Verify `reset/migrate/seed` flow works end-to-end.

### Tool/account access needed
- OpenAI project key.
- Supabase project and dashboard access.
- Vercel team/project access.
- PostHog project.
- Resend domain/API key.

### First implementation prompt (to use only after PREP PASS)
See final section in this file.

## 10) Stage Governance

- Stage sequence: Discover -> Define -> Tooling -> Skills -> Build Milestones -> Stage-close QA -> Handover.
- Stage-close QA loop: L1 static, L2 component, L3 integration, L4 browser/system, docs freshness, git hygiene.
- Commit strategy: commit by purpose (scaffold/auth/chat/check-ins/safety/docs/qa), never mix unrelated cleanup.
- Push/review policy: no push with known failed required checks; no "pending QA" commit claims.
- Docs freshness checks: README, DECISIONS, project plan, skills, transcripts, QA evidence must match current code.
- Handover requirements: next action, file map, branch/commit sync, divergences, explicit commit/push guardrails.

## 11) Subagent Work Plan

### Parallel-safe tasks
- Tool pricing/docs verification by category.
- UX pattern reference research.
- Safety policy research baseline.

### Critical-path tasks (main agent only)
- Final stack decision.
- Scope and milestone lock.
- Security/privacy acceptance criteria.
- Final go/no-go gate and implementation prompt.

### Expected subagent outputs
- `project-prep/research/<topic>.md` with source links + recommendation.

### Integration method
- Main agent merges findings into decision log and updates this bundle after each stage.

## 12) Transcript And Evidence Plan

- Preserve full AI sessions for: discovery, tool decision, architecture decisions, and stage-close QA.
- Keep curated extracts in decision log for quick reviewer scan, but never as replacement for full sessions.
- Store transcript evidence under ticket/project trace path already used in this repo (`spec/<TICKET>/...`) and index links in handover.
- QA evidence should include command outputs, browser-flow proof, and date-stamped stage notes.

---

## PREP GATE: PASS (with explicit assumptions)

Resolved decisions:
1. Primary segment: young professionals.
2. Product direction: native-first roadmap.
3. Model preference: OpenAI preferred.
4. Monetization: no paid subscription in MVP.
5. Memory requirement: robust persistent memory is mandatory in MVP.

Open assumption to confirm during Milestone 1:
- Crisis/self-harm default behavior is `supportive resources + constrained continuation` unless you specify a stricter default.

---

If/when blockers are answered and PREP GATE becomes PASS, use this exact next prompt:

`You are the Implementation Agent for AI Bestie. Use project-prep/ai-bestie-preparation-bundle.md and linked project-prep docs as source of truth. Start with Milestone 1 only: scaffold the app workspace, environment contracts, baseline migration+seed flow, and CI checks. Do not implement product features yet. After Milestone 1, run L1-L4 verification where applicable, report evidence, and update docs freshness artifacts before proposing any commit.`
