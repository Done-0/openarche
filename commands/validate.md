---
description: Define or execute validation for a planned change
allowed-tools: Read, Bash, Write
---

Use this command to inspect or update the validation stage for the current harness session.

Required behavior:

1. Prefer the current session state in `.openarche/sessions/<task-id>/state.json`.
   Only create a separate note when the user explicitly asks for one.
2. Read the current `runbook.validation` section and keep its structure stable.
3. Use `runbook.validation` as the source of truth for:
   - acceptance checks
   - regression checks
   - browser validation state
   - observability validation state
   - blockers
   - readiness
4. If the user is attaching validation evidence, update `runbook.validation` and store any file evidence under `.openarche/sessions/<task-id>/evidence/` instead of inventing a parallel format.
5. Keep validation conclusions aligned with current product rules:
   - acceptance checks must pass
   - regression checks must pass
   - browser evidence is required when browser validation is enabled
   - observability evidence is required when observability checks are present

When presenting the validation work, organize it into:

- acceptance checks
- regression checks
- browser journeys and required browser evidence
- observability evidence
- blockers that still keep validation open
