---
description: Scan conversation history and extract experiences into OpenArche memory
allowed-tools: Bash
---

Count unprocessed transcripts that qualify (mtime ≥ 12h, user turns ≥ 5, contains tool_use):

```bash
node -e "
const fs=require('fs'),path=require('path'),os=require('os');
const projectsDir=path.join(os.homedir(),'.claude','projects');
const processedFile=path.join(os.homedir(),'.claude','openarche','processed.json');
let processed=new Set();
try{processed=new Set(JSON.parse(fs.readFileSync(processedFile,'utf8')));}catch{}
const SILENCE_MS=12*60*60*1000;
let count=0;
try{
  for(const proj of fs.readdirSync(projectsDir,{withFileTypes:true})){
    if(!proj.isDirectory())continue;
    try{
      for(const f of fs.readdirSync(path.join(projectsDir,proj.name))){
        if(!f.endsWith('.jsonl'))continue;
        const fp=path.join(projectsDir,proj.name,f);
        if(processed.has(fp))continue;
        const s=fs.statSync(fp);
        if(Date.now()-s.mtimeMs<SILENCE_MS)continue;
        const content=fs.readFileSync(fp,'utf8');
        if(!content.includes('\"tool_use\"'))continue;
        const turns=content.split('\\n').filter(l=>{try{return JSON.parse(l)?.message?.role==='user';}catch{return false;}}).length;
        if(turns>=5)count++;
      }
    }catch{}
  }
}catch{}
console.log(count);
"
```

If count is 0: tell the user there are no qualifying conversations to process (either all processed already, or none have been quiet for 12h with enough turns).

Check if ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is set:

```bash
node -e "console.log(process.env.ANTHROPIC_AUTH_TOKEN?'AUTH_TOKEN_SET':process.env.ANTHROPIC_API_KEY?'API_KEY_SET':'NO_KEY');"
```

If NO_KEY: tell the user an API key is required and stop.

If count > 0: tell the user "Found N qualifying conversations. Starting extraction in background — StatusLine will show progress." then run:

```bash
node -e "
const {spawn}=require('child_process'),path=require('path'),os=require('os'),fs=require('fs');
const cacheDir=path.join(os.homedir(),'.claude','plugins','cache','openarche','openarche');
const versions=fs.readdirSync(cacheDir).sort();
const pluginDir=path.join(cacheDir,versions[versions.length-1]);
const env=Object.assign({},process.env);
const child=spawn(process.execPath,[path.join(pluginDir,'dist','extractor','bootstrap.js')],{detached:true,stdio:'ignore',env});
child.unref();
console.log('Extraction started');
"
```
