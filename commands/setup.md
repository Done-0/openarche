---
description: Initialize OpenArche memory plugin
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

## Step 0: Ghost install check

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const base=path.join(os.homedir(),'.claude','plugins','cache','openarche');
const reg=path.join(os.homedir(),'.claude','plugins','installed_plugins.json');
const hasCache=fs.existsSync(base);
let hasReg=false;
try{hasReg=fs.readFileSync(reg,'utf8').includes('openarche');}catch{}
console.log('Cache:',hasCache?'YES':'NO','Registry:',hasReg?'YES':'NO');
"
```

- Cache=YES, Registry=NO → delete the cache directory, tell user to reinstall
- Cache=NO, Registry=YES → read `installed_plugins.json`, remove the openarche entry, write it back
- Otherwise → continue

## Step 1: Detect runtime

```bash
node -e "console.log(process.execPath)"
```

Also check for bun:

```bash
bun --version 2>/dev/null && echo BUN_AVAILABLE || echo NO_BUN
```

Use node with `dist/hooks/prompt.js`.

If node is not available, stop and tell the user to install Node.js (https://nodejs.org).

Save the node executable path — you will need it in Step 3.

## Step 2: Init data directory

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const base=path.join(os.homedir(),'.claude','openarche');
fs.mkdirSync(path.join(base,'memories'),{recursive:true});
fs.mkdirSync(path.join(base,'models'),{recursive:true});
const defaults={
  'index.json': JSON.stringify({version:1,memories:[]}),null,2),
  'processed.json': JSON.stringify([],null,2),
  'state.json': JSON.stringify({totalMemories:0,lastMatch:null,bootstrapping:{current:0,total:0}},null,2),
  'config.json': JSON.stringify({embedding:{provider:'local',localModel:'Xenova/multilingual-e5-small',remoteProvider:'',remoteModel:'',remoteApiKey:''},retrieval:{threshold:0.72,topK:5,maxInjectChars:3000},extraction:{model:'claude-haiku-4-5-20251001',minQualityScore:0.6,bootstrapConcurrency:3}},null,2)
};
for(const[name,content]of Object.entries(defaults)){
  const p=path.join(base,name);
  if(!fs.existsSync(p))fs.writeFileSync(p,content,'utf8');
}
console.log('Data directory ready:',base);
"
```

Then pre-warm the embedding model (so the first real hook invocation is fast). First find the plugin directory:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
const versions=fs.readdirSync(cacheDir).sort();
console.log(path.join(cacheDir,versions[versions.length-1]));
"
```

Then run from that directory:

```bash
cd PLUGIN_DIR && node --input-type=module << 'EOF'
import { pipeline, env } from '@xenova/transformers';
import { join } from 'path';
import { homedir } from 'os';
env.cacheDir = join(homedir(), '.claude', 'openarche', 'models');
try {
  await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { quantized: true });
  console.log('Model ready');
} catch(e) {
  if (e.message && e.message.includes('sharp')) {
    console.log('Model ready (sharp optional dependency skipped)');
  } else {
    console.error('Model download failed:', e.message);
    console.error('The model will be downloaded on first use. If you are offline, connect to the internet and re-run /openarche:setup.');
  }
}
EOF
```

Tell the user: the embedding model (~120MB) is downloading. This only happens once.

## Step 3: Register hooks and statusLine

Get the settings.json path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','settings.json'));"
```

Read that file using the Read tool. If it does not exist, start with `{}`.

Merge in the following hooks (replace `RUNTIME` with the full node path detected in Step 1, `SOURCE` with `dist/hooks/prompt.js`):

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PATH_TO_PLUGIN/SOURCE"}]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PATH_TO_PLUGIN/dist/hooks/stop.js"}]
    }]
  }
}
```

For `PATH_TO_PLUGIN`, find the installed plugin directory:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
try{
  const versions=fs.readdirSync(cacheDir).sort();
  console.log(path.join(cacheDir,versions[versions.length-1]));
}catch{console.log('NOT_FOUND');}
"
```

If `statusLine` key does not already exist in settings.json, add:
```json
{"statusLine": {"type": "command", "command": "RUNTIME PATH_TO_PLUGIN/dist/hooks/status-line.js"}}
```
If `statusLine` already exists (e.g. claude-hud), skip — do not overwrite.

Write the merged object back to the settings.json path (obtained above) using the Write tool.

## Step 4: Bootstrap

Count unprocessed transcripts:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const projectsDir=path.join(os.homedir(),'.claude','projects');
const processedFile=path.join(os.homedir(),'.claude','openarche','processed.json');
let processed=new Set();
try{processed=new Set(JSON.parse(fs.readFileSync(processedFile,'utf8')));}catch{}
let count=0;
try{
  for(const proj of fs.readdirSync(projectsDir,{withFileTypes:true})){
    if(!proj.isDirectory())continue;
    try{
      for(const f of fs.readdirSync(path.join(projectsDir,proj.name))){
        if(f.endsWith('.jsonl')&&!processed.has(path.join(projectsDir,proj.name,f)))count++;
      }
    }catch{}
  }
}catch{}
console.log(count);
"
```

Use AskUserQuestion:
- header: "历史经验导入"
- question: "发现 N 个历史对话记录。是否从中提取开发经验作为初始记忆库？（分析在后台进行，不影响你继续使用 Claude Code）" (replace N with actual count)
- options: ["是，帮我分析", "不，从现在开始积累"]

If yes, find the plugin directory (from Step 3) then run bootstrap in background:

```bash
node -e "
const {spawn}=require('child_process'),path=require('path'),os=require('os');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
const fs=require('fs');
const versions=fs.readdirSync(cacheDir).sort();
const pluginDir=path.join(cacheDir,versions[versions.length-1]);
const child=spawn(process.execPath,[path.join(pluginDir,'dist','extractor','bootstrap.js')],{detached:true,stdio:'ignore'});
child.unref();
console.log('Bootstrap started');
"
```

Tell user bootstrap is running in the background. StatusLine will show `extracting X/Y...` progress.

## Step 5: Verify

Use AskUserQuestion:
- question: "Setup complete! The embedding model (~120MB) has been downloaded. Start a new conversation and OpenArche will work automatically. All good?"
- options: ["Yes", "Something's wrong"]

If something's wrong, help the user check:
1. Re-run the `node -e` path command from Step 3, then Read that file and confirm hooks are present
2. Run `node --version` to verify Node.js is accessible
3. Confirm the plugin directory exists (Step 3 path detection)
4. Suggest re-running `/openarche:setup` if anything looks off
