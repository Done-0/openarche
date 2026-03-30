---
description: Rebuild OpenArche vector index after switching embedding models
allowed-tools: Read, Write, Bash
---

Run this after the user has changed `embedding.provider` in their OpenArche config. First get the data directory paths:

```bash
node -e "const os=require('os'),path=require('path'),base=path.join(os.homedir(),'.claude','openarche');console.log('INDEX:',path.join(base,'index.json'));console.log('CONFIG:',path.join(base,'config.json'));"
```

1. Read the index file to get all memories
2. Read the config file to get the current embedding config
3. For each memory, re-generate its embedding by calling the embedding API/model configured (provider, model, key from config)
   - Embed `title + " " + trigger_context` — same field as during ingestion
   - Replace the `embedding` array in the memory entry
4. Write the updated index file back (preserve all other fields: links, score, access_count, etc.)
5. Tell the user how many memories were reindexed and with which provider.
