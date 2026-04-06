---
description: Search OpenArche knowledge
allowed-tools: Bash, Read
---

Search OpenArche knowledge with repository-local knowledge first and global knowledge as fallback.

Required behavior:

1. Find the relevant OpenArche knowledge stores.
   If the user is inside a repository, search `.openarche/knowledge/` first.
   Then search the global store under `<home>/.claude/openarche/knowledge/`.
2. Read and validate the current config.
3. Load the relevant `index.json` files.
   If a store is missing, treat that store as empty.
   If a store exists but is invalid, report that the knowledge index is corrupted.
4. Build the query embedding with the current embedding provider.
5. Run vector recall with the configured threshold and topK across the merged search space.
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
- whether the result came from the repository-local or global store
- whether the result came from direct vector recall or link expansion

If both stores are empty, say so plainly.
