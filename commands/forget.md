---
description: Delete a specific experience from OpenArche by ID
allowed-tools: Bash, Read, Write
---

Ask the user which memory to delete if they have not specified one. Use `/openarche:list` to show available IDs if needed.

Once you have the ID, run this single node script — it handles the index update and file deletion in one step:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const id=process.argv[1];
const base=path.join(os.homedir(),'.claude','openarche');
const indexPath=path.join(base,'index.json');
const idx=JSON.parse(fs.readFileSync(indexPath,'utf8'));
idx.memories.forEach(e=>{e.links=e.links.filter(l=>l!==id);});
idx.memories=idx.memories.filter(e=>e.id!==id);
fs.writeFileSync(indexPath,JSON.stringify(idx,null,2),'utf8');
try{fs.unlinkSync(path.join(base,'memories',id+'.md'));}catch{}
console.log('Deleted',id);
" "THE_ACTUAL_ID"
```

Tell the user the memory was deleted.
