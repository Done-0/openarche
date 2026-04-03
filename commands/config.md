---
description: View or update OpenArche configuration
allowed-tools: Bash, Read, Write
---

Get the config file path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','openarche','config.json'));"
```

Read that file. If it does not exist, tell the user to run `/openarche:setup` first to initialize the data directory.

Display the current configuration to the user in a readable format, grouped by section, and tell them the config file location (the path printed above):

**Embedding**
- `provider` — `local` (default) or `remote`
- `localModel` — local model name (default: `Xenova/multilingual-e5-small`)
- `remoteModel` — remote model name (e.g., `text-embedding-3-small`, `BAAI/bge-m3`)
- `remoteApiKey` — API key for remote embedding
- `remoteBaseUrl` — remote API base URL (supports all OpenAI-compatible APIs)

**Retrieval**
- `threshold` — similarity cutoff 0.0–1.0 (default: `0.73`). Higher = fewer but more relevant results
- `topK` — max seed memories to inject per prompt (default: `3`)
- `maxInjectChars` — max total characters injected per prompt (default: `3000`)
- `reranking.enabled` — enable reranking (default: `false`)
- `reranking.provider` — `local` (weighted) or `remote` (API-based, e.g., BGE-reranker)
- `reranking.remoteModel` — remote rerank model (e.g., `BAAI/bge-reranker-v2-m3`)
- `reranking.remoteApiKey` — API key for remote reranking
- `reranking.remoteBaseUrl` — remote rerank API base URL
- `reranking.weights.*` — local reranking weights (similarity: 0.7, quality: 0.2, recency: 0.05, frequency: 0.05)

**Extraction**
- `model` — Claude model used for experience extraction (default: `claude-haiku-4-5-20251001`)
- `minQualityScore` — discard extractions below this score 0.0–1.0 (default: `0.6`). Higher = stricter
- `bootstrapConcurrency` — parallel transcripts during bootstrap (default: `3`)

If the user has not specified what to change, ask which setting they want to update and what value to set.

Once you know what to change, update the relevant field(s) and write the config file back.

If `embedding.provider` was changed, remind the user:
> You changed the embedding provider. Run `/openarche:reindex` to rebuild the vector index — existing memories will not match until you do.

If `reranking.enabled` was changed to `true`, explain to the user:
> **Reranking enabled.** This will reorder search results based on:
> - `local` provider: weighted combination of similarity, quality, recency, and frequency (no API calls)
> - `remote` provider: uses a specialized rerank model API (e.g., BGE-reranker) for better relevance (requires API key and baseUrl)
