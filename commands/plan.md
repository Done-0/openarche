---
description: Create an execution plan with explicit acceptance criteria
allowed-tools: Read, Bash, Write
---

Use this command to inspect, draft, revise, or save a real execution plan.

Required behavior:

1. Build a plan with these fields:
   - `objective`
   - `acceptance criteria`
   - `execution steps`
2. Every execution step must include:
   - `title`
   - `capability`
   - `outcome`
3. Only use valid capability names:
   - `planning`
   - `worktree`
   - `browser`
   - `observability`
   - `review`
   - `maintenance`
   - `knowledge`
4. Keep the plan valid under current product rules:
   - objective must not be empty
   - there must be at least one acceptance criterion
   - there must be at least one execution step
   - duplicate acceptance criteria are not allowed
   - duplicate capability/title step pairs are not allowed
   - step titles and outcomes must not be empty

When presenting the plan, organize it into:

- objective
- acceptance criteria
- execution steps
- capability coverage

If the user asks to save it, write the plan to `.openarche/<plan-id>.plan.json` unless they explicitly ask for another location.
