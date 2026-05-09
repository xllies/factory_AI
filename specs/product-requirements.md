# Product Requirements: Dark Factory MVP

## Product Overview

Dark Factory converts product requirements into a reviewable Jira execution plan and then creates Jira issues only after approval.

## Product Areas

### Requirements Ingestion

- Support a default requirements file at `specs/product-requirements.md`.
- Allow overriding the source path from the CLI.
- Preserve section traceability from markdown headings.

### Plan Generation

- Build a structured plan with epics, tasks, and subtasks.
- Capture acceptance criteria from requirement sections.
- Identify open questions when details are missing or ambiguous.

### Jira Application

- Provide a review-first workflow before Jira mutation.
- Create Epics, Tasks, and Subtasks with hierarchy links.
- Return a summary containing created issue keys and URLs.

## User Stories

### Product owner can generate a plan

As a product owner, I want a structured JSON plan generated from markdown so I can review scope before Jira issues are created.

Acceptance criteria:
- Plan command reads default source path when no input is provided.
- Plan output contains epics, tasks, subtasks, and open questions.
- Source sections are referenced in generated items.

### Engineering lead can review before apply

As an engineering lead, I want to inspect a generated plan before writing to Jira so we can catch scope or hierarchy mistakes.

Acceptance criteria:
- Apply command prints a preflight hierarchy summary.
- Jira writes are blocked unless explicit approval is provided.

### Developer receives actionable Jira tasks

As a developer, I want generated issues to include enough detail and acceptance criteria so implementation can start immediately.

Acceptance criteria:
- Generated tasks include clear descriptions and acceptance criteria.
- Subtasks are linked to parent tasks.
- Tasks are grouped under the correct epic.

## Dependencies

- Jira API credentials and project permissions are required for apply flow.
- Issue types Epic, Task, and Subtask must exist in target project configuration.

## Open Questions

- Should complexity be estimated from text heuristics or set manually after review?
- Should generated labels include requirement section slugs by default?
