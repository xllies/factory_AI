# AI Bestie Implementation Plan

Canonical source: `project-prep/ai-bestie-preparation-bundle.md` section 8.

Tracks:
- milestone order
- task dependencies
- acceptance criteria
- verification requirements before stage close

## Current progress

- Milestone 1 started:
  - app scaffold created in `apps/ai-bestie/`
  - baseline API routes created (`health`, `profile`, `memory`, `checkins`, `chat`)
  - initial Supabase schema and seed added
- Next:
  - install and run full checks locally (`mvp:typecheck`, `mvp:lint`, `mvp:build`)
  - wire real auth and profile ownership in mobile-first flow
