Continuation run — dispatch smoke confirmed.

**State**
- Branch `tdf/kan-7` already carries the smoke marker `docs/smoke/KAN-7.md`
  plus `spec/KAN-7/plan.md` and `spec/KAN-7/response.md` from the prior run.
- The Jira ticket moved from `To Do` to `In Progress` after the prior run
  opened the PR — i.e. the dispatch loop is working end-to-end.
- No new ticket comments and no scope change, so nothing further was
  implemented this run.

**What this validates**
`repository_dispatch: jira_manual_button` → `jira-dispatch.yml` → Claude →
branch → PR → Jira status update all fire correctly on this repo.

**Risks**
None. Documentation-only marker under `docs/smoke/`; safe to delete with
the ticket once validation is signed off.
