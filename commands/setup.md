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

If node is not available, stop and tell the user to install Node.js (https://nodejs.org).

Save the node executable path — you will need it in Step 3.

## Step 2: Build plugin

Find the plugin directory:

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

Save this as PLUGIN_DIR. If NOT_FOUND, tell the user to run `/plugin install openarche` first.

Check if `dist/` exists (replace `PLUGIN_DIR` with the actual path obtained above):

```bash
node -e "console.log(require('fs').existsSync(require('path').join('PLUGIN_DIR','dist'))?'EXISTS':'MISSING');"
```

If MISSING, build the plugin (replace `PLUGIN_DIR` with the actual path):

```bash
node -e "
const {execSync}=require('child_process');
execSync('npm install',{cwd:'PLUGIN_DIR',stdio:'inherit',shell:true});
execSync('npm run build',{cwd:'PLUGIN_DIR',stdio:'inherit',shell:true});
console.log('Build complete');
"
```

Then apply the sharp compatibility patch (replace `PLUGIN_DIR` with the actual path):

```bash
node -e "
const fs=require('fs'),path=require('path');
const sharpIndex=path.join('PLUGIN_DIR','node_modules','sharp','lib','index.js');
if(!fs.existsSync(sharpIndex)){console.log('sharp not found, skipping');process.exit(0);}
const src=fs.readFileSync(sharpIndex,'utf8');
if(src.includes('degrade gracefully')){console.log('already patched');process.exit(0);}
const patched=`// patched for graceful degradation\n'use strict';\ntry {\nconst Sharp = require('./constructor');\nrequire('./input')(Sharp);\nrequire('./resize')(Sharp);\nrequire('./composite')(Sharp);\nrequire('./operation')(Sharp);\nrequire('./colour')(Sharp);\nrequire('./channel')(Sharp);\nrequire('./output')(Sharp);\nrequire('./utility')(Sharp);\nmodule.exports = Sharp;\n} catch (e) {\n// Native binary unavailable — degrade gracefully\nconst stub = function Sharp() { return stub; };\nstub.format = () => ({});\nstub.versions = {};\nstub.interpolators = [];\nstub.counters = () => ({});\nmodule.exports = stub;\n}\n`;
fs.writeFileSync(sharpIndex,patched,'utf8');
console.log('sharp patched');
"
```

## Step 3: Init data directory and pre-warm embedding model

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const base=path.join(os.homedir(),'.claude','openarche');
fs.mkdirSync(path.join(base,'memories'),{recursive:true});
fs.mkdirSync(path.join(base,'models'),{recursive:true});
const defaults={
  'index.json': JSON.stringify({version:1,memories:[]},null,2),
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

Tell the user: the embedding model (~120MB) is now downloading. This only happens once.

Pre-warm the embedding model (replace `PLUGIN_DIR` with actual path, downloads model on first run):

```bash
node -e "
const {execFileSync}=require('child_process'),path=require('path');
const promptHook=path.join('PLUGIN_DIR','dist','hooks','prompt.js');
try{
  execFileSync(process.execPath,[promptHook],{
    input:JSON.stringify({prompt:'warmup',cwd:process.cwd()}),
    stdio:['pipe','pipe','pipe'],
    timeout:180000
  });
  console.log('Model ready');
}catch(e){
  console.log('Model ready (warm-up note:',e.stderr?.toString().slice(0,100)||'none',')');
}
"
```

## Step 4: Register hooks and statusLine

Get the settings.json path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','settings.json'));"
```

Read that file using the Read tool. If it does not exist, start with `{}`.

Merge in the following hooks. Use `path.join(pluginDir, 'dist', 'hooks', 'prompt.js')` etc. to build paths (cross-platform). Replace `RUNTIME` with the full node path from Step 1:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/hooks/prompt.js"}]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/hooks/stop.js"}]
    }]
  }
}
```

If `statusLine` key does not already exist in settings.json, add:
```json
{"statusLine": {"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/hooks/status-line.js"}}
```
If `statusLine` already exists (e.g. claude-hud), skip — do not overwrite.

Write the merged object back to the settings.json path using the Write tool.

## Step 5: Bootstrap

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

Check if ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is set:

```bash
node -e "console.log(process.env.ANTHROPIC_AUTH_TOKEN?'AUTH_TOKEN_SET':process.env.ANTHROPIC_API_KEY?'API_KEY_SET':'NO_KEY');"
```

If NO_KEY: tell the user bootstrap requires an API key and skip to Step 6.

Use AskUserQuestion:
- header: "历史经验导入"
- question: "发现 N 个历史对话记录。是否从中提取开发经验作为初始记忆库？（分析在后台进行，不影响你继续使用 Claude Code）" (replace N with actual count)
- options: ["是，帮我分析", "不，从现在开始积累"]

If yes:

```bash
node -e "
const {spawn}=require('child_process'),path=require('path'),os=require('os'),fs=require('fs');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
const versions=fs.readdirSync(cacheDir).sort();
const pluginDir=path.join(cacheDir,versions[versions.length-1]);
const env=Object.assign({},process.env);
const child=spawn(process.execPath,[path.join(pluginDir,'dist','extractor','bootstrap.js')],{detached:true,stdio:'ignore',env});
child.unref();
console.log('Bootstrap started');
"
```

Tell user bootstrap is running in the background. StatusLine will show `extracting X/Y...` progress.

## Step 6: Verify

Use AskUserQuestion:
- question: "Setup complete! Start a new conversation and OpenArche will work automatically. All good?"
- options: ["Yes", "Something's wrong"]

If something's wrong, help the user check:
1. Re-run the path detection from Step 2, confirm `dist/` exists
2. Run `node --version` to verify Node.js is accessible
3. Re-run the `node -e` path command from Step 4, Read settings.json and confirm hooks are present
4. Suggest re-running `/openarche:setup` if anything looks off
