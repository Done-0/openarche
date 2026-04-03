---
description: Rebuild OpenArche vector index after switching embedding models
allowed-tools: Read, Write, Bash
---

Run this after the user has changed `embedding.provider` in their OpenArche config.

## Implementation

First, get the config and index paths:

```bash
node -e "const os=require('os'),path=require('path'),base=path.join(os.homedir(),'.claude','openarche');console.log('INDEX:',path.join(base,'index.json'));console.log('CONFIG:',path.join(base,'config.json'));"
```

Then run the reindex script directly with `node -e`. Replace `<CONFIG_PATH>` and `<INDEX_PATH>` with the paths from above:

```bash
node -e "
const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const CONFIG_PATH = process.argv[1];
const INDEX_PATH = process.argv[2];

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const { provider, remoteModel, remoteApiKey, remoteBaseUrl } = config.embedding;

if (provider !== 'remote') {
  console.error('Error: Only remote embedding providers are supported for reindexing');
  console.error('Current provider:', provider);
  process.exit(1);
}

if (!remoteBaseUrl || !remoteModel || !remoteApiKey) {
  console.error('Error: remoteBaseUrl, remoteModel, and remoteApiKey are required');
  process.exit(1);
}

const apiUrl = remoteBaseUrl.replace(/\/$/, '') + '/embeddings';

async function embed(text) {
  const url = new URL(apiUrl);
  const postData = JSON.stringify({ model: remoteModel, input: text });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + remoteApiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('API error ' + res.statusCode + ': ' + data));
          return;
        }
        try {
          const json = JSON.parse(data);
          if (!json.data || !json.data[0] || !json.data[0].embedding) {
            reject(new Error('Invalid API response'));
            return;
          }
          resolve(json.data[0].embedding);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  const memories = index.memories;
  const total = memories.length;
  console.log('Reindexing ' + total + ' memories with ' + remoteModel + '...');

  const BATCH_SIZE = 10;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = memories.slice(i, Math.min(i + BATCH_SIZE, total));
    await Promise.all(batch.map(async (memory) => {
      const text = memory.title + ' ' + memory.trigger_context;
      try {
        memory.embedding = await embed(text);
      } catch (err) {
        console.error('Failed to embed memory ' + memory.id + ':', err.message);
        throw err;
      }
    }));
    if ((i + BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= total) {
      console.log('Processed ' + Math.min(i + BATCH_SIZE, total) + '/' + total + '...');
    }
  }

  const tmpPath = INDEX_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf8');
  fs.renameSync(tmpPath, INDEX_PATH);
  console.log('✓ Reindexing complete! All ' + total + ' memories updated.');
})().catch(err => {
  console.error('Reindexing failed:', err);
  process.exit(1);
});
" <CONFIG_PATH> <INDEX_PATH>
```

The script:
- Processes memories in batches of 10 to avoid memory issues
- Shows progress every 10 memories
- Preserves all metadata (links, scores, access counts)
- Uses atomic writes to prevent data corruption
- Supports all OpenAI-compatible embedding APIs via remoteBaseUrl
