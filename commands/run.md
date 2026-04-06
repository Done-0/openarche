---
description: Turn a plan into an execution checklist
allowed-tools: Read, Bash, Write
---

Use this command to inspect, draft, revise, or save a real runbook.

Required behavior:

1. Prefer an existing plan when one exists.
2. Build a runbook that stays aligned with the current harness structure:
   - execution isolation
   - validation protocol
   - observability protocol when required
   - review loop
   - maintenance follow-up
3. Keep the runbook aligned with current product behavior:
   - execution must use the configured isolation strategy
   - validation must include acceptance checks and regression checks
   - observability is only required when it is enabled and relevant services exist
   - review must reflect enabled review paths and merge checks
   - maintenance must reflect the current cleanup and knowledge-capture requirements

When presenting the runbook, organize it into:

- execution isolation
- validation
- observability
- review
- maintenance

Prefer capability-oriented structure over implementation-layer structure.

If the user asks to save it, write the runbook to `.openarche/<plan-id>.runbook.json` unless they explicitly ask for another location.
