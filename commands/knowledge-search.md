---
description: Search OpenArche knowledge
allowed-tools: Bash, Read
---

Search the local OpenArche knowledge store for reusable engineering knowledge.

Required behavior:

1. Find the OpenArche data directory.
2. Read and validate the current config.
3. Load the current `index.json`.
   If it is missing, treat the store as empty.
   If it exists but is invalid, report that the knowledge index is corrupted.
4. Build the query embedding with the current embedding provider.
5. Run vector recall with the configured threshold and topK.
6. Expand linked neighbors from the recalled seed entries.
7. Prefer current-project knowledge over cross-project knowledge when similarity is close, matching product behavior.

When presenting results, show each match in this form:

```text
[type/structure] id — title
  trigger: trigger_context
  score: X.X  via: vector|link  tags: tag1, tag2
```

If the user asks for more detail, also show:

- source project
- whether the result came from direct vector recall or link expansion

If the knowledge store is empty, say so plainly.
