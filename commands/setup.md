---
description: Initialize OpenArche for harness sessions and task closeout
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
---

Initialize OpenArche in a way a first-time user can understand.

Keep the explanation short and practical:

- what OpenArche will start doing automatically after setup
- why complex tasks will be handled differently
- whether the plugin is ready
- what the user should do next

Only mention Claude Code internal hook names when you are editing `settings.json` or showing exact config keys.

## Step 0: Ghost Install Check

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

- Cache=YES, Registry=NO: delete the cache directory, then tell the user to reinstall
- Cache=NO, Registry=YES: remove the `openarche` entry from `installed_plugins.json`
- Otherwise: continue

## Step 1: Detect Runtime

```bash
node -e "console.log(process.execPath)"
```

If node is not available, stop and tell the user to install Node.js (https://nodejs.org).

Save the node executable path. You will use it in Step 4.

## Step 2: Build Plugin

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

Save this as `PLUGIN_DIR`. If it returns `NOT_FOUND`, tell the user to run `/plugin install openarche` first.

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

After `dist/` is present, verify the embedding runtime when the current install will use local embeddings. Replace `PLUGIN_DIR` with the actual path:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const {pathToFileURL}=require('url');
const configPath=path.join(os.homedir(),'.claude','openarche','config.json');
if(!fs.existsSync(configPath)){
  console.log('SKIP_RUNTIME_CHECK');
  process.exit(0);
}
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.knowledge?.embedding?.provider!=='local'){
  console.log('SKIP_RUNTIME_CHECK');
  process.exit(0);
}
import(pathToFileURL(path.join('PLUGIN_DIR','dist','knowledge','embedding.js')).href).then(()=>{
  console.log('RUNTIME_READY');
}).catch(err=>{
  console.error(String(err));
  process.exit(1);
});
"
```

- If this check fails with a missing package or runtime error, do not describe it as a model download.
- Install runtime dependencies in `PLUGIN_DIR` before continuing:

```bash
node -e "
const {execSync}=require('child_process');
execSync('npm install',{cwd:'PLUGIN_DIR',stdio:'inherit',shell:true});
console.log('Runtime dependencies ready');
"
```

- Re-run the runtime check after `npm install`.
- If the runtime check still fails, tell the user the local embedding runtime is not ready and stop instead of pretending setup succeeded.

## Step 3: Initialize Data Directory

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const base=path.join(os.homedir(),'.claude','openarche');
fs.mkdirSync(path.join(base,'knowledge'),{recursive:true});
fs.mkdirSync(path.join(base,'models'),{recursive:true});
const defaults={
  'index.json': JSON.stringify({version:1,entries:[]},null,2),
  'capture-log.json': JSON.stringify([],null,2),
  'state.json': JSON.stringify({knowledgeCount:0,lastRecall:null,captureSync:{current:0,total:0},activeSession:null},null,2),
  'config.json': JSON.stringify({
    knowledge:{
      embedding:{provider:'local',localModel:'Xenova/multilingual-e5-small'},
      retrieval:{threshold:0.73,topK:3,maxInjectChars:4000},
      extraction:{model:'claude-haiku-4-5-20251001',minQualityScore:0.6,captureConcurrency:3}
    },
    execution:{isolationStrategy:'git-worktree',baseRef:'main'},
    validation:{browser:{enabled:true,captureDomSnapshot:true,captureScreenshot:true,captureNavigation:true}},
    observability:{enabled:true,logs:true,metrics:true,traces:true},
    review:{localSelfReview:true,localAgentReview:true,cloudAgentReview:true,repairLoops:3},
    maintenance:{qualitySweep:true,driftSweep:true}
  },null,2)
};
const {pathToFileURL}=require('url');
const pluginDir='PLUGIN_DIR';
Promise.all([
  import(pathToFileURL(path.join(pluginDir,'dist','config.js')).href),
  import(pathToFileURL(path.join(pluginDir,'dist','state.js')).href),
  import(pathToFileURL(path.join(pluginDir,'dist','knowledge','index-store.js')).href),
]).then(async ([configMod,stateMod,indexMod])=>{
  for(const[name,content]of Object.entries(defaults)){
    const p=path.join(base,name);
    if(!fs.existsSync(p)){
      fs.writeFileSync(p,content,'utf8');
      continue;
    }
    try{
      if(name==='config.json') await configMod.loadConfig(p);
      else if(name==='state.json') await stateMod.loadState(p);
      else if(name==='index.json') await indexMod.loadIndex(p);
      else JSON.parse(fs.readFileSync(p,'utf8'));
    }catch{
      fs.writeFileSync(p,content,'utf8');
    }
  }
  console.log('Data directory ready:',base);
}).catch(err=>{
  console.error(String(err));
  process.exit(1);
});
"
```

Tell the user the data directory is ready.

Optionally pre-warm the local embedding model when the current config uses `provider: "local"` and the runtime check already passed (replace `PLUGIN_DIR` with actual path):

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const {pathToFileURL}=require('url');
const base=path.join(os.homedir(),'.claude','openarche');
const config=JSON.parse(fs.readFileSync(path.join(base,'config.json'),'utf8'));
if(config.knowledge.embedding.provider!=='local'){
  console.log('Skipped local model warm-up because remote embeddings are configured');
  process.exit(0);
}
const embeddingPath=path.join('PLUGIN_DIR','dist','knowledge','embedding.js');
import(pathToFileURL(embeddingPath).href).then(async mod=>{
  await mod.embed('warmup',config);
  console.log('Local model ready');
}).catch(err=>{
  console.error(String(err));
  process.exit(1);
});
"
```

Tell the user a local embedding model download can happen on first use. Skip this message when the current config uses remote embeddings.

If warm-up fails with `fetch failed` or another network error:

- explain that the local model download could not reach the model host
- tell the user they can retry with network access, or switch to remote embeddings through `/openarche:config`
- do not describe this as a code or package failure

If warm-up fails with a missing package or native module error:

- explain that the local embedding runtime is incomplete or broken
- re-run the `npm install` recovery step from Step 2
- tell the user setup is not complete for local embeddings if the error still remains

## Step 4: Register Hooks And Status Line

Get the settings.json path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','settings.json'));"
```

Read that file using the Read tool. If it does not exist, start with `{}`.

When explaining this step to the user, say that OpenArche is registering:

- a prompt hook for task interception
- a stop hook for task closeout and knowledge capture
- a status line command when the slot is free

Also explain the user-visible effect in plain language:

- complex tasks can be automatically moved into a harness session
- OpenArche will keep missing stages visible
- task closeout and knowledge capture can happen after stop

Merge in the following hooks. Use `path.join(pluginDir, 'dist', 'integrations', 'claude', 'prompt-hook.js')` etc. to build paths (cross-platform). Replace `RUNTIME` with the full node path from Step 1:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/integrations/claude/prompt-hook.js"}]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/integrations/claude/stop-hook.js"}]
    }]
  }
}
```

If `statusLine` does not already exist in `settings.json`, add:
```json
{"statusLine": {"type": "command", "command": "RUNTIME PLUGIN_DIR/dist/integrations/claude/status-line.js"}}
```
If `statusLine` already exists, skip it and do not overwrite.

Write the merged object back to `settings.json`.

## Step 5: Bootstrap Knowledge

Count bootstrap-eligible transcripts using the same filtering rules as the product:

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const {pathToFileURL}=require('url');
const base=path.join(os.homedir(),'.claude','openarche');
const bootstrapPath=path.join('PLUGIN_DIR','dist','knowledge','bootstrap.js');
import(pathToFileURL(bootstrapPath).href).then(async mod=>{
  const processedPath=path.join(base,'capture-log.json');
  let processed=new Set();
  try{
    processed=new Set(JSON.parse(fs.readFileSync(processedPath,'utf8')));
  }catch(err){
    if(err.code!=='ENOENT') throw err;
  }
  const projectsDir=path.join(os.homedir(),'.claude','projects');
  const paths=await mod.findUnprocessedTranscripts(projectsDir,processed);
  console.log(paths.length);
}).catch(err=>{
  console.error(String(err));
  process.exit(1);
});
"
```

Check if ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is set:

```bash
node -e "console.log(process.env.ANTHROPIC_AUTH_TOKEN?'AUTH_TOKEN_SET':process.env.ANTHROPIC_API_KEY?'API_KEY_SET':'NO_KEY');"
```

If the transcript count is `0`, tell the user there is nothing to import and skip to Step 6.

If the transcript count is greater than `0` and the result is `NO_KEY`, tell the user bootstrap requires an API key and skip to Step 6.

Use AskUserQuestion:
- header: "Import"
- question: "OpenArche found N prior Claude transcripts. Import reusable engineering knowledge from them in the background?" (replace N with actual count)
- options: ["Yes, import", "No, start fresh"]

If yes:

```bash
node -e "
const {spawn}=require('child_process'),path=require('path'),os=require('os'),fs=require('fs');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
const versions=fs.readdirSync(cacheDir).sort();
const pluginDir=path.join(cacheDir,versions[versions.length-1]);
const env=Object.assign({},process.env);
const child=spawn(process.execPath,[path.join(pluginDir,'dist','knowledge','bootstrap.js')],{detached:true,stdio:'ignore',env});
child.unref();
console.log('Bootstrap started');
"
```

Tell the user bootstrap is running in the background. The status line will show `knowledge sync X/Y...` progress.

End with a short plain-language summary. Use this structure:

- OpenArche is ready
- what will now happen automatically on complex tasks
- what the user should do next: use Claude Code normally and open the explicit commands only when they want direct control

## Step 6: Verify

Use AskUserQuestion:
- question: "Setup complete! Start a new conversation and OpenArche will work automatically. All good?"
- options: ["Yes", "Something's wrong"]

If something is wrong, help the user check the setup result and hook registration.
1. Re-run the path detection from Step 2, confirm `dist/` exists
2. Run `node --version` to verify Node.js is accessible
3. Re-run the `node -e` path command from Step 4, Read settings.json and confirm hooks are present
4. If local embeddings are configured, re-run the runtime and warm-up checks from Step 2 and Step 3
5. Suggest re-running `/openarche:setup` if anything looks off
