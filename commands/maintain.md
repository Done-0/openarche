---
description: Sweep drift, low-value patterns, and maintenance follow-up
allowed-tools: Read, Bash, Write
---

Use this command to inspect or update the maintenance stage for the current harness session.

Required behavior:

1. Prefer the current session state in `.openarche/sessions/<task-id>/state.json`.
   Only create a separate note when the user explicitly asks for one.
2. Read the current `runbook.maintenance.spec` section and keep its existing structure stable.
3. Use `runbook.maintenance.spec` as the source of truth for:
   - `qualitySweep`
   - `driftSweep`
   - `cleanupTasks`
   - `knowledgeCapture`
   - `knowledgeCaptureSummary`
   - `followupsRecorded`
   - `blockers`
   - `ready`
4. If you update maintenance state, write it back into the session state and keep the full file valid.
5. If the task is tied to a harness session, prefer updating the real session state over writing free-form prose.

When presenting maintenance work, organize it into:

- cleanup tasks already recorded
- whether knowledge capture is still pending, queued, captured, failed, or not applicable
- whether follow-ups are fully recorded
- what blockers still keep the maintenance stage open

Do not invent maintenance tasks outside the current spec unless the user explicitly asks to add them.
