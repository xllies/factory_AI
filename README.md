# dark_factory

> Dark Factory — orchestrator scaffolding under the `cursor-hack` org.

## Status

KAN-8 foundation implemented: markdown requirements can now be converted into a structured Jira plan and then applied to Jira with an explicit approval gate.

## Layout

```text
dark_factory/
├── specs/
│   └── product-requirements.md
├── schemas/
│   └── jira-plan.schema.json
├── scripts/
│   ├── dark-factory.ts
│   └── generate-jira-plan.ts
├── output/
│   └── generated-plan.json (created by CLI)
└── tests/
    └── plan-cli.test.mjs
```

## Getting started

```bash
git clone git@github.com:cursor-hack/dark_factory.git
cd dark_factory
npm install
```

## CLI flow

Generate a structured plan from markdown requirements:

```bash
npx tsx scripts/dark-factory.ts plan specs/product-requirements.md --out output/generated-plan.json
```

Equivalent helper entrypoint:

```bash
npx tsx scripts/generate-jira-plan.ts specs/product-requirements.md --out output/generated-plan.json
```

Review and then apply to Jira (writes happen only with `--approve`):

```bash
npx tsx scripts/dark-factory.ts apply output/generated-plan.json --project KAN
npx tsx scripts/dark-factory.ts apply output/generated-plan.json --project KAN --approve --out output/applied-issues.json
```

Required env vars for Jira apply:

```bash
export JIRA_BASE_URL="https://<site>.atlassian.net"
export JIRA_EMAIL="<email>"
export JIRA_API_TOKEN="<token>"
```

## Verification

```bash
npm test
```

## License

Not yet decided.
