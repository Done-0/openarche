---
description: Search the OpenArche memory library with a query
allowed-tools: Bash, Read
---

The user provides a search query. First get the index path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','openarche','index.json'));"
```

Read that file. If it does not exist or has no memories, tell the user the memory library is empty.

For each memory, compare the query semantically to `title` and `trigger_context`. Rank by relevance. Show the top matches (up to 10) as:

```
[type/structure] id — title
  trigger: trigger_context
  score: X.X  tags: tag1, tag2
```
