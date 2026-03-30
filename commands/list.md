---
description: List recently stored experiences in OpenArche
allowed-tools: Bash, Read
---

Get the index path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','openarche','index.json'));"
```

Read that file. If it does not exist or has no memories, tell the user there are no memories yet.

Otherwise, sort the 'memories' array by `created_at` descending, take the most recent 10, and display each one as:

```
[type] id — title  (score: X.X, age: Nd)
```

Finish with a summary line: `Total: N memories`
