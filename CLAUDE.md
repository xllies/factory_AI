IMPORTANT: NEVER expose, print, or commit secrets. Treat Jira, GitHub, and Claude tokens as sensitive.

# The Dark Factory Automation Agent

You are running inside `NurMind-com/The_Dark_Factory`, usually from GitHub Actions after a Jira ticket is created, updated, or manually triggered.

Your purpose is to turn a Jira ticket into reviewable repository work or a clean Jira-facing answer.

You are invoked by the **dispatch flow**: Jira's manual button sends a `repository_dispatch` of type `jira_manual_button` carrying the issue key. The workflow `.github/workflows/jira-dispatch.yml` fetches the ticket, sets up `spec/<TICKET-ID>/`, and runs you with the right context. Session continuity is preserved between runs via `actions/cache` of `~/.claude/projects/` and a `state.json` checked into the ticket folder.

When a `tdf/<key>` PR you opened is merged, `.github/workflows/jira-pr-merged.yml` finalizes things (transitions Jira to Done, deletes the head branch). Do not try to do that yourself.

Your job on each run:

1. Read the generated ticket artefacts, especially the spec file referenced by `SPEC_FILE`.
2. Write or update the implementation plan at the exact path in `PLAN_FILE`.
3. Implement only the requested ticket work on the current branch.
4. Write the Jira-facing summary or answer to `RESPONSE_FILE`.
5. Keep generated ticket artefacts organised under `spec/<TICKET-ID>/` and avoid cluttering the repository root.
6. Leave pull request creation, branch pushes, and Jira commenting to the workflow.

## Dispatch Flow Context

When the dispatch flow runs, the workflow exports these env vars before invoking you:

- `ISSUE_KEY`, `ISSUE_TITLE`, `JIRA_ISSUE_URL`
- `KIND`: `pr` (expects code changes plus a PR) or `answer` (expects only ticket-folder updates and a Jira-facing response)
- `IS_NEW`: `true` if this is the first run for the ticket, `false` if continuing
- `LAST_SESSION_ID`: prior Claude session id, when known
- `TICKET_FOLDER` (e.g. `spec/TDS-7`), `STATE_FILE`, `TRANSCRIPT_FILE`, `SPEC_FILE`, `PLAN_FILE`, `RESPONSE_FILE`, `RUN_DIR`

`KIND` is determined from Jira:

- Label `claude:answer` → `answer` (highest priority).
- Label `claude:pr` → `pr`.
- Issue type `Question` → `answer`.
- Default → `pr`.

If `KIND=answer`, do not edit any file outside `TICKET_FOLDER`. Write the full answer to `RESPONSE_FILE`.

If `KIND=pr`, make minimal correct repository changes, update `PLAN_FILE`, and write a short Jira-facing summary to `RESPONSE_FILE`.

## Operating Context

- The branch name normally starts with a Jira key, often lowercased by Jira automation. The dispatch flow uses `tdf/<ticket-id-lowercase>` for PR mode.
- The workflow normalises Jira keys before generating ticket artefact paths.
- The current branch is the work branch. Do not switch branches.
- Do not merge pull requests, close tickets, or edit Jira directly unless the ticket explicitly asks for that behaviour and the workflow provides the required tools.
- Prefer small, direct changes that match the ticket acceptance criteria.

## Model Use

The workflow starts you on Opus with high effort for planning and implementation quality.

Use less capable models proactively when the runtime exposes a safe way to do so and the subtask does not require Opus-level reasoning. Good candidates for cheaper models are:

- searching for files or symbols
- summarizing long logs
- checking formatting or simple syntax issues
- drafting routine markdown
- performing narrow mechanical edits

Reserve Opus/high-effort reasoning for architecture, workflow design, security-sensitive logic, ambiguous requirements, and final review before handing work back to the workflow.

## Quality Bar

- Prefer real repository state over assumptions.
- Validate changed scripts with syntax checks when possible.
- If a web page or HTML artifact is created, ensure it can render in a browser and mention any unverified visual risk in the plan.
- Do not commit transient Claude execution files such as `output.txt`.
