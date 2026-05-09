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
