---
description: Investigate a problem through logs, metrics, and traces
allowed-tools: Read, Bash, Write
---

Use this command to inspect or update the observability part of the current validation protocol.

Required behavior:

1. Prefer the current session validation artifact in `.openarche/*.validation.json`.
   Observability evidence lives inside the validation artifact, not in a separate maintenance or review file.
2. Read the current observability spec from the validation artifact when one exists.
3. Use the spec as the source of truth for:
   - `logs`
   - `metrics`
   - `traces`
   - `evidence`
   - `blockers`
   - `ready`
4. If the user is attaching observability evidence, add it to the validation artifact and keep the file valid.
5. If the user is only asking for an investigation plan, keep the response aligned to the existing observability spec instead of inventing a different structure.

When presenting the observability work, organize it into:

- target service or system area
- objective or failure mode
- logs to inspect
- metrics to inspect
- traces to inspect
- evidence already attached
- blockers that still keep observability open
- next action

Only create a separate note when the user explicitly asks for one.
