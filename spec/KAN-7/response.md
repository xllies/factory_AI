Dispatch smoke validated end-to-end.

**What changed**
- Added `docs/smoke/KAN-7.md` — a single, clearly-disposable marker file
  documenting that the Jira manual-button dispatch produced a real repo
  change for this ticket.
- Wrote `spec/KAN-7/plan.md` with the chosen approach.

**Why**
The ticket is a placeholder to confirm `repository_dispatch:
jira_manual_button` → `jira-dispatch.yml` → Claude → branch → PR works on
this repo. A docs-only marker is the smallest change that exercises the
PR path without touching workflows, README, or any runtime code.

**Risks**
None. The change is documentation-only and isolated under `docs/smoke/`.
The marker is safe to delete once validation is complete (a follow-up
ticket can remove it together with the Jira issue).
