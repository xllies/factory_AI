# dark_factory

Monorepo for the Dark Factory orchestrator and the product apps it spawns.

## What's in here

```text
dark_factory/
├── apps/
│   ├── recall/          ← voice-first personal assistant (active product)
│   └── ai-bestie/       ← wellbeing companion (earlier prototype)
├── scripts/             ← Dark Factory CLI (Jira plan generator)
├── specs/               ← markdown product requirements consumed by the CLI
├── schemas/             ← JSON Schema for the generated Jira plans
├── tests/               ← node:test suites for the CLI
├── .github/workflows/   ← Jira manual-button → Claude Code dispatch
└── spec/                ← per-ticket folders (auto-generated, do not edit by hand)
```

## Active product: Recall

[`apps/recall`](apps/recall/) is the personal-assistant app. Hold a button,
talk, and Recall classifies what you said as a memory or an action,
extracts dates, sets reminders, and exports to your calendar.

See [`apps/recall/README.md`](apps/recall/README.md) for setup. TL;DR:

```bash
npm install
cp apps/recall/.env.example apps/recall/.env.local   # add Supabase + OpenAI keys
# run the two migrations in apps/recall/supabase/migrations/
cd apps/recall && npm run dev   # → http://localhost:3001
```

## Earlier prototype: AI Bestie

[`apps/ai-bestie`](apps/ai-bestie/) is a wellbeing companion chatbot built
during an earlier sprint. It still runs but is not the current focus.

```bash
npm run mvp:dev    # → http://localhost:3000 (port 3000)
```

## Dark Factory orchestrator

The orchestrator turns Jira tickets into Pull Requests via GitHub Actions
and Claude Code. It runs in CI, not locally — see
[`CLAUDE.md`](CLAUDE.md) for the runtime contract and
[`.github/workflows/jira-dispatch.yml`](.github/workflows/jira-dispatch.yml)
for the entry point.

The CLI for generating a Jira backlog from a markdown spec:

```bash
# Generate a structured plan from markdown requirements
npx tsx scripts/dark-factory.ts plan specs/product-requirements.md \
  --out output/generated-plan.json

# Review, then apply to Jira (writes happen only with --approve)
npx tsx scripts/dark-factory.ts apply output/generated-plan.json --project KAN
npx tsx scripts/dark-factory.ts apply output/generated-plan.json --project KAN --approve
```

Required env vars for the apply step:

```bash
export JIRA_BASE_URL="https://<site>.atlassian.net"
export JIRA_EMAIL="<email>"
export JIRA_API_TOKEN="<token>"
```

## Verification

```bash
npm test                    # CLI tests
npm run mvp:typecheck       # ai-bestie typecheck
npm run --workspace=recall typecheck   # recall typecheck
```

## License

Not yet decided.
