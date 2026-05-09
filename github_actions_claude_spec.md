# GitHub Actions + Claude Code Spec

Reference for running Claude Code from GitHub Actions with cross-run session continuity. Validated end-to-end in this repo on 2026-05-07 via `.github/workflows/poc-session.yml` and the `temp/poc/POC-2/` artefacts.

## Purpose

Allow a workflow run to either:

- Start a fresh Claude Code conversation for a ticket, or
- Resume a Claude Code conversation that a previous workflow run started, on a different ephemeral GitHub Actions runner.

Without this, every workflow run starts Claude with no memory of prior runs. Tickets that need iterative work cannot make progress across runs.

## Architecture

Per ticket, three things must be persisted between runs:

1. The Claude Code session state directory `~/.claude/projects/`. Cached per ticket using `actions/cache`.
2. The Claude Code session ID. Committed in `state.json` so the next run can pass it to `--resume`.
3. A human-readable transcript of every run. Committed in `transcript.md`. Acts as recovery context if the cache is evicted (GitHub Actions evicts caches after seven days of inactivity).

```
spec/<TICKET-ID>/                     (or temp/poc/<TICKET-ID> for POC)
  state.json       last_session_id, run_count, last_kind, last_run_at
  transcript.md    one section per run with prompt, response, session ids
  spec.md          ticket snapshot (refreshed on each run)
  plan.md          implementation plan owned by Claude
  response.md      the message the workflow posts back to Jira
  runs/<ts>-<id>/  per-run prompt and response copies
```

## Verified Flow

```
┌────────────────┐
│ workflow_dispatch (or repository_dispatch from Jira)
└──────┬─────────┘
       │
       v
┌────────────────────────┐
│ Checkout main          │
└──────┬─────────────────┘
       │
       v
┌──────────────────────────────────────────────┐
│ Prepare ticket context                       │
│  - read state.json if present                │
│  - export LAST_SESSION_ID                    │
│  - build CLAUDE_ARGS:                        │
│      "--max-turns N"                         │
│      "--max-turns N --resume <id>" if known  │
└──────┬───────────────────────────────────────┘
       │
       v
┌────────────────────────────┐
│ actions/cache/restore@v4   │
│ key:        <prefix>-<run> │
│ restore-keys: <prefix>-     │  (prefix match)
│ path: ~/.claude/projects   │
└──────┬─────────────────────┘
       │
       v
┌─────────────────────────────────────────────┐
│ anthropics/claude-code-base-action@main      │
│  prompt: <ticket prompt>                    │
│  claude_args: $CLAUDE_ARGS                  │
│  outputs: session_id, execution_file        │
└──────┬──────────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────────┐
│ Capture run outputs                         │
│  - read action's session_id output          │
│  - fallback: jq the execution_file JSON     │
│  - update state.json (jq)                   │
│  - append transcript.md                     │
└──────┬──────────────────────────────────────┘
       │
       v
┌────────────────────────────┐
│ actions/cache/save@v4      │
│ key: <prefix>-<run>         │
│ path: ~/.claude/projects   │
└──────┬─────────────────────┘
       │
       v
┌────────────────────────────────────┐
│ Commit state.json + transcript.md  │
│ (and any code changes)             │
│ then push                          │
└────────────────────────────────────┘
```

## Action Requirements

Use `anthropics/claude-code-base-action@main`.

Do not use `@beta`. The `@beta` tag is older and:

- Does **not** accept `claude_args`. Passing it emits a warning and the value is silently dropped, so `--resume` never reaches the CLI.
- Does **not** expose the `session_id` output.

The `@main` ref includes both, plus other CLI passthrough.

Inputs we rely on:

- `claude_code_oauth_token` — from `secrets.CLAUDE_CODE_OAUTH_TOKEN`.
- `prompt` (or `prompt_file`).
- `settings` — JSON, e.g. `{ "model": "sonnet", "effortLevel": "high" }`.
- `claude_args` — extra flags forwarded verbatim to the `claude` CLI.

Outputs we rely on:

- `session_id` — UUID. Pass to `--resume` next run.
- `execution_file` — path on the runner to a JSON file with the full conversation. Always present even when `session_id` is empty (older actions, fallback case).
- `conclusion` — `success` or `failure`.

## Cache Strategy

Path: `~/.claude/projects` (resolves to `/home/runner/.claude/projects` on `ubuntu-latest`). Inside, Claude creates a project subdirectory derived from the cwd path slug, e.g. `-home-runner-work-The-Dark-Factory-The-Dark-Factory`.

Key pattern:

- Save key: `claude-session-<TICKET-ID>-<github.run_id>` (unique per run, so `actions/cache/save@v4` does not error on duplicate-key).
- Restore key: same exact key first.
- Restore-keys (prefix list): `claude-session-<TICKET-ID>-`. This is what actually matches on the second run, since the run id changes.

Cache eviction:

- Default GitHub Actions cache TTL: seven days of inactivity.
- After eviction, `--resume <id>` will fail at the CLI level because the prior session transcripts are gone from disk.
- Mitigation: even if Claude cannot resume, the run can rebuild context from `state.json` and `transcript.md` and start a fresh session. Always pass plan.md/spec.md/transcript.md content into the prompt, and treat `--resume` as a best-effort acceleration.

## Session ID Behavior

Observed in the POC:

- New session: action emits a UUID.
- Resume: action emits the same UUID. No rotation observed.

Documented behavior elsewhere claims session ID can rotate on resume. Defensive handling:

- After every run, always update `state.json` with the freshly emitted `session_id`, regardless of whether it equals the prior id.
- Treat session ID as opaque.
- If `--resume <id>` fails, do not retry blindly. Drop `--resume`, run a fresh session, and have the prompt reload the transcript context.

## State Persistence

`state.json` schema:

```json
{
  "ticket_id": "POC-2",
  "kind": "pr|answer",
  "branch": "tdf/poc-2",
  "pr_url": "https://github.com/NurMind-com/The_Dark_Factory/pull/123",
  "last_session_id": "ad71ec06-f81e-4524-9d61-8a94f7eef9eb",
  "prev_session_id": "ad71ec06-f81e-4524-9d61-8a94f7eef9eb",
  "last_run_at": "2026-05-07T22:16:47Z",
  "last_conclusion": "success",
  "last_kind": "continuation",
  "run_count": 2
}
```

Update with `jq` in-place during the workflow.

## Implementation Reference

Minimum workflow snippet (proven):

```yaml
name: Claude Session Run

on:
  workflow_dispatch:
    inputs:
      ticket_id: { required: true }
      prompt:    { required: true }

permissions:
  contents: write

concurrency:
  group: claude-session-${{ github.event.inputs.ticket_id }}
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      TICKET_ID: ${{ github.event.inputs.ticket_id }}
      PROMPT_INPUT: ${{ github.event.inputs.prompt }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          token: ${{ secrets.GH_PR_TOKEN }}
          fetch-depth: 0

      - name: Prepare state
        run: |
          set -euo pipefail
          DIR="spec/${TICKET_ID}"
          mkdir -p "${DIR}"
          [ -f "${DIR}/state.json" ] || printf '{}\n' > "${DIR}/state.json"
          [ -f "${DIR}/transcript.md" ] || printf '# %s Transcript\n' "${TICKET_ID}" > "${DIR}/transcript.md"
          LAST="$(jq -r '.last_session_id // empty' "${DIR}/state.json")"
          if [ -n "${LAST}" ]; then
            ARGS="--max-turns 60 --resume ${LAST}"
            KIND="continuation"
          else
            ARGS="--max-turns 60"
            KIND="new"
          fi
          mkdir -p "$HOME/.claude/projects"
          {
            echo "DIR=${DIR}"
            echo "STATE_FILE=${DIR}/state.json"
            echo "TRANSCRIPT_FILE=${DIR}/transcript.md"
            echo "LAST_SESSION_ID=${LAST}"
            echo "CLAUDE_ARGS=${ARGS}"
            echo "RUN_KIND=${KIND}"
          } >> "${GITHUB_ENV}"

      - name: Restore Claude session cache
        id: cache-restore
        uses: actions/cache/restore@v4
        with:
          path: ~/.claude/projects
          key: claude-session-${{ env.TICKET_ID }}-${{ github.run_id }}
          restore-keys: |
            claude-session-${{ env.TICKET_ID }}-

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-base-action@main
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          settings: |
            { "model": "sonnet" }
          prompt: ${{ env.PROMPT_INPUT }}
          claude_args: ${{ env.CLAUDE_ARGS }}

      - name: Capture run outputs
        env:
          ACTION_SESSION_ID: ${{ steps.claude.outputs.session_id }}
          CONCLUSION: ${{ steps.claude.outputs.conclusion }}
          EXECUTION_FILE: ${{ steps.claude.outputs.execution_file }}
        run: |
          set -euo pipefail
          rm -f output.txt || true
          NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

          NEW_SESSION_ID="${ACTION_SESSION_ID}"
          if [ -z "${NEW_SESSION_ID}" ] && [ -n "${EXECUTION_FILE:-}" ] && [ -f "${EXECUTION_FILE}" ]; then
            NEW_SESSION_ID="$(jq -r '[.[] | select(.session_id != null) | .session_id] | last // ""' "${EXECUTION_FILE}")"
          fi
          echo "NEW_SESSION_ID=${NEW_SESSION_ID}" >> "${GITHUB_ENV}"

          ASSISTANT_TEXT=""
          if [ -n "${EXECUTION_FILE:-}" ] && [ -f "${EXECUTION_FILE}" ]; then
            ASSISTANT_TEXT="$(jq -r '[.[]|select(.type=="assistant")|.message.content[]?|select(.type=="text")|.text]|last // ""' "${EXECUTION_FILE}")"
          fi

          jq --arg sid "${NEW_SESSION_ID}" \
             --arg prev "${LAST_SESSION_ID}" \
             --arg now "${NOW}" \
             --arg conclusion "${CONCLUSION}" \
             --arg kind "${RUN_KIND}" \
             '.last_session_id=$sid
              | .prev_session_id=(if $prev=="" then null else $prev end)
              | .last_run_at=$now
              | .last_conclusion=$conclusion
              | .last_kind=$kind
              | .run_count=((.run_count // 0)+1)' \
             "${STATE_FILE}" > "${STATE_FILE}.tmp"
          mv "${STATE_FILE}.tmp" "${STATE_FILE}"

          {
            printf '\n## Run %s\n' "${NOW}"
            printf -- '- run_kind: %s\n' "${RUN_KIND}"
            printf -- '- prev_session_id: %s\n' "${LAST_SESSION_ID:-<none>}"
            printf -- '- new_session_id: %s\n' "${NEW_SESSION_ID:-<none>}"
            printf -- '- conclusion: %s\n' "${CONCLUSION:-<unknown>}"
            printf -- '- prompt: %s\n' "${PROMPT_INPUT}"
            printf -- '- response: %s\n' "${ASSISTANT_TEXT:-<empty>}"
          } >> "${TRANSCRIPT_FILE}"

      - name: Save Claude session cache
        if: env.NEW_SESSION_ID != ''
        uses: actions/cache/save@v4
        with:
          path: ~/.claude/projects
          key: claude-session-${{ env.TICKET_ID }}-${{ github.run_id }}

      - name: Commit and push state
        run: |
          set -euo pipefail
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A "${DIR}"
          if git diff --cached --quiet; then
            echo "No state changes"
            exit 0
          fi
          git commit -m "${TICKET_ID}: run ${{ github.run_id }} (${RUN_KIND})"
          git push origin HEAD:main
```

## Gotchas

- `@beta` of `claude-code-base-action` is older and lacks `claude_args` and `session_id` output. Always pin `@main` (or a newer tagged release that includes them).
- The `@main` action defaults to interactive permission prompts which cannot be answered in CI. Pass `--permission-mode bypassPermissions` via `claude_args`. Without it, `Write` and shell redirection to repo paths are blocked at the harness level even if `--allowedTools` looks correct.
- `git diff --quiet -- <path>` does not include untracked files. Stage with `git add -A` first, then check `git diff --cached --quiet`. Otherwise the very first run never commits its `state.json`.
- bash `printf` interprets a leading `-` in the format string as a flag and exits with code 2. Use `printf -- '-...'` whenever the format starts with a hyphen.
- The `@main` action does not echo the assistant's response into the public step log. Either set `show_full_output: true` or extract the text from `execution_file` with `jq`. Setting `show_full_output: true` also prints tool results, which can leak secrets; prefer the `jq` path.
- `cache-hit` from `actions/cache/restore@v4` is `false` even when `restore-keys` matches a prior cache. Use `cache-matched-key` to detect the prefix-match case.
- `actions/cache/save@v4` errors on duplicate exact keys. Always include a unique component (we use `${{ github.run_id }}`).
- Cache TTL: seven days of inactivity. Plan for cache miss as a normal case, not an error.
- Workflow steps that push to `main` or `tdf/<ticket>` need a PAT with `contents: write` (`secrets.GH_PR_TOKEN`), not just the default `GITHUB_TOKEN`, if the repo has branch protection or requires PAT for workflow file pushes.
- Concurrency group must be per-ticket so the same ticket cannot run twice in parallel and stomp on cache and state. `cancel-in-progress: false` queues, doesn't cancel.
- Jira-format smart values (`{{comment.body.plainText}}`) and dispatch payloads must use plain JSON for `repository_dispatch`. Never log the GitHub PAT used by the Jira `Send web request` action; mark the Authorization header as Hidden after first successful validation.
- Branch ordering: do not write files to disk before deciding whether to switch to an existing per-ticket branch. If you do, `git checkout` will refuse to overwrite the untracked files. Either move the branch checkout into the prepare step (before file writes) or split prepare into route/files phases.
- `commit-changes` for answer mode must `git push origin HEAD:main` while still on `main`. Do not check out a PR branch in answer mode, even if one exists, or pushing `HEAD:main` will push the branch tip to `main`.

## Cost (Sonnet, observed)

- Single short prompt (~10 tokens out): ~$0.028 USD per run.
- Two-run seed+resume: ~$0.06 USD total.

Real ticket runs with longer prompts and tool use will cost more. Budget on the order of cents-per-turn at Sonnet, dollars-per-turn at Opus.

## Validated Test (POC-2)

Run 1 (`workflow_dispatch`, ticket_id=POC-2):

- prompt: `Remember: my favorite color is fuchsia. Reply with just 'OK'.`
- response: `OK`
- session_id: `ad71ec06-f81e-4524-9d61-8a94f7eef9eb`
- run_kind: `new`

Run 2 (`workflow_dispatch`, same ticket_id):

- restore-keys matched `claude-session-POC-2-<run_id_of_run_1>` and restored `~/.claude/projects/`.
- claude_args included `--resume ad71ec06-f81e-4524-9d61-8a94f7eef9eb`.
- prompt: `What is my favorite color? Answer in one word.`
- response: `Fuchsia.`
- session_id: same as run 1.
- run_kind: `continuation`.

Both runs committed back to `main`: `temp/poc/POC-2/state.json` and `temp/poc/POC-2/transcript.md`.

## Production Implementation (validated 2026-05-08)

The Jira dispatch flow is implemented in this repo:

- Helper: `.github/scripts/jira-dispatch.mjs` — modes `prepare-dispatch`, `record-run`, `commit-changes`, `ensure-pr`, `comment-result`.
- Workflow: `.github/workflows/jira-dispatch.yml` — listens on `repository_dispatch` type `jira_manual_button` with `workflow_dispatch` fallback for manual runs.
- Updated `CLAUDE.md` with dispatch flow context and PR-vs-answer routing rules.

Smoke-test results:

- TDS-7 (label `claude:answer`): two runs against this ticket. Run 1 caught the missing `bypassPermissions` and surfaced a clean failure message; run 2 (after the fix) resumed the same Claude session, recognised the prior failure (referenced commit `efa608a` by hash), and wrote the response file. Jira got the answer comment.
- TDS-8 (label `claude:pr`): two runs. Run 1 created `tdf/tds-8`, committed the marker file `temp/dispatch_pr_smoke.md`, opened PR #9, posted the Jira comment with branch + PR links. Run 2 (continuation) checked out the existing PR branch, resumed Claude on the same session id, and reused the existing PR (no duplicates).

Both modes survived a real session-continuity hop, both posted Jira comments, both committed to the right ref (main for answer, branch for pr).
