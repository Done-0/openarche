---
description: Manually save an experience to OpenArche
allowed-tools: Bash, Read, Write
---

Two usage modes:

**Mode A — no argument (extract from current transcript):**

Find the data directory and current transcript:

```bash
node -e "
const os=require('os'),path=require('path'),fs=require('fs');
const base=path.join(os.homedir(),'.claude');
const projectsDir=path.join(base,'projects');
const memoriesBase=path.join(base,'openarche');
console.log('PROJECTS:',projectsDir);
console.log('MEMORIES_BASE:',memoriesBase);
// Find most recently modified .jsonl
let latest='',latestMtime=0;
for(const proj of fs.readdirSync(projectsDir,{withFileTypes:true})){
  if(!proj.isDirectory())continue;
  for(const f of fs.readdirSync(path.join(projectsDir,proj.name))){
    if(!f.endsWith('.jsonl'))continue;
    const fp=path.join(projectsDir,proj.name,f);
    const m=fs.statSync(fp).mtimeMs;
    if(m>latestMtime){latestMtime=m;latest=fp;}
  }
}
console.log('TRANSCRIPT:',latest);
"
```

Read the transcript file. Extract reusable insights using the same criteria as the Stop hook extractor (non-obvious solutions, decisions, patterns, gotchas). For each insight:

1. Determine `type` (solution/decision/pattern/gotcha), `structure` (atomic/linear/tree/graph), `title`, `trigger_context`, `body`, `tags`, `quality` (0.0–1.0)
2. Skip if `quality < 0.6`
3. Generate a random 8-char hex `id`
4. Append the memory entry to the index file at `MEMORIES_BASE/index.json` (set `embedding: []` — will be populated on next reindex)
5. Write the memory file to `MEMORIES_BASE/memories/<id>.md` with the standard frontmatter + body format
6. Report how many experiences were saved

**Mode B — with text (user provides content directly):**

First get the memory base path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','openarche'));"
```

The user's text becomes an atomic memory. Determine `type` and set `structure: "atomic"`. Follow steps 3–6 above using the path from this command. Set `quality: 0.9` since it is user-curated.

Note: `embedding` will be empty until the next UserPromptSubmit hook runs and triggers reindexing, or the user runs `/openarche:reindex`.
