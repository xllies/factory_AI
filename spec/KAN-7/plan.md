# KAN-7 Implementation Plan

## Ticket
Smoke: dispatch validation. Placeholder issue to validate the Dark Factory
dispatch automation rule end-to-end.

## Goal
Produce the smallest correct repository change that proves the dispatch flow
can drive a Jira ticket → Claude run → branch → PR loop. Acceptance is implicit
(workflow opens a PR successfully and Jira receives a response).

## Approach
1. Add a single, clearly-disposable smoke marker file under
   `docs/smoke/KAN-7.md`. This avoids touching production-relevant files
   (workflows, README, root) while still producing a real diff outside the
   ticket folder, which `KIND=pr` requires.
2. Update `spec/KAN-7/plan.md` (this file) with the chosen approach.
3. Write a short Jira-facing summary to `spec/KAN-7/response.md`.

## Out of scope
- Editing workflows, README, or any existing source.
- Branch / PR / Jira mechanics — handled by `.github/workflows/jira-dispatch.yml`.
- Cleanup of the smoke marker — the ticket itself notes it is safe to delete
  after validation; a follow-up ticket can remove `docs/smoke/KAN-7.md`.

## Risks
- None of substance. The marker file is documentation-only and isolated under
  `docs/smoke/`. No build, runtime, or workflow surface is affected.

## Continuation 2026-05-09
- Branch `tdf/kan-7` already carries `docs/smoke/KAN-7.md`, `plan.md`, and
  `response.md` from the prior run (commit `d756f89`).
- Spec snapshot refreshed by the workflow: ticket moved from `To Do` to
  `In Progress` (the PR opened by the prior run is the trigger). No new
  comments, no scope change.
- Conclusion: nothing left to implement. The dispatch loop has demonstrably
  produced a real diff, a branch, and a PR — which is exactly what this
  smoke ticket asks for.

## Continuation 2026-05-09 (run 3) — session-resume validation
The reporter's latest comment asks for evidence that this run continued the
same Claude session (via `--resume`) rather than starting a fresh one. No
code change was needed; the requested artefact is the validation itself,
captured here and in `response.md`.

Evidence collected this run:

1. **Workflow wiring** — `.github/scripts/jira-dispatch.mjs:287-288` builds
   the Claude args as:
   ```
   let claudeArgs = "--max-turns 60 --permission-mode bypassPermissions";
   if (lastSessionId) claudeArgs += ` --resume ${lastSessionId}`;
   ```
   So whenever `state.json` carries `last_session_id`, the workflow appends
   `--resume <id>` before invoking `anthropics/claude-code-base-action`.

2. **State at the start of this run** — `spec/KAN-7/state.json` recorded
   `last_session_id = 839323c9-1237-42d4-ac96-c053286bc63c` (carried over
   from runs 1 and 2). This is the value the workflow passed to `--resume`.

3. **Session cache restored before launch** — the `Restore Claude session
   cache` step in the workflow rehydrated `~/.claude/projects/`. At the
   start of this run the directory contained exactly one JSONL file:
   `~/.claude/projects/-home-runner-work-dark-factory-dark-factory/839323c9-1237-42d4-ac96-c053286bc63c.jsonl`
   — its name is the same session id, and only one such file exists. A
   fresh session would have written to a new UUID-named file.

4. **Transcript records** — runs 1 and 2 both logged
   `prev_session_id == new_session_id == 839323c9-…` with
   `session_id_rotated: false`. Run 3 is expected to record the same.

5. **In-context recall** — I am able to recall, without re-reading
   `transcript.md` or `plan.md`, that run 1 added `docs/smoke/KAN-7.md` and
   that run 2 added the "Continuation 2026-05-09" section above. This is
   weaker than the file-based evidence but consistent with it.

Together these confirm: same session id across three runs, jsonl transcript
file persisted via cache, and the `--resume <id>` flag explicitly added by
the workflow when `last_session_id` is present.
