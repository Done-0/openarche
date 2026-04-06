---
description: Review a change and drive repair loops
allowed-tools: Read, Bash, Write
---

Use this command to inspect or update the review stage for the current harness session.

Required behavior:

1. Prefer the current session review artifact in `.openarche/*.review.json`.
   Only create a separate note when the user explicitly asks for one.
2. Read the current review loop and keep its structure stable.
3. Use the review artifact as the source of truth for:
   - enabled review paths
   - merge checks
   - blockers
   - review state
   - readiness
4. If the user is updating review status, update the review artifact instead of inventing a parallel format.
5. Keep review conclusions aligned with validation readiness. Do not mark review ready if validation is still open.

When presenting the review work, organize it into:

- correctness risks
- regressions
- missing validation
- architecture drift
- unresolved review blockers
- whether self-review, local agent review, and cloud agent review are complete when enabled
- whether feedback and build failures are resolved
- whether any judgment call still requires escalation
