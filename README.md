# OpenArche [![English](https://img.shields.io/badge/Docs-English-red?style=flat-square)](README.md) [![简体中文](https://img.shields.io/badge/文档-简体中文-blue?style=flat-square)](README_ZH.md)

Local developer memory plugin for Claude Code. Automatically learns from your conversations and recalls relevant knowledge when you need it — fully local, zero cloud dependency.

## Why

OpenArche solves three problems every developer hits with Claude Code:

1. **No memory between sessions** — every conversation starts from scratch, repeating the same context every time
2. **Re-solving the same problems across projects** — a solution you figured out in project A is forgotten by the time you're in project B
3. **No personalization** — Claude never learns your tech preferences, your decisions, or the traps you've already fallen into

OpenArche fixes all three by silently building a local knowledge base from your conversations, and surfacing the right knowledge exactly when you need it.

## Features

- **Auto-extract** — after each conversation, extracts reusable insights via Claude Haiku and stores them as local Markdown files
- **Auto-inject** — before each prompt, vector-searches relevant memories and injects them as hidden context for Claude (invisible to you, visible to Claude)
- **Knowledge graph** — memories link to each other bidirectionally; retrieval expands through BFS graph traversal for richer context
- **StatusLine** — real-time memory count and last match in the Claude Code status bar

## Getting started

**1. Add the plugin:**

```
/plugin marketplace add Done-0/openarche
```

**2. Install:**

```
/plugin install openarche
```

**3. Run setup:**

```
/openarche:setup
```

Setup handles all configuration automatically and optionally bootstraps from your conversation history. Downloads the local embedding model (~120MB) on first run — one time only.

**4. Done.** OpenArche runs fully automatically in the background.

## Commands

| Command | Description |
|---------|-------------|
| `/openarche:setup` | Initialize plugin, batch-extract memories from all conversation history |
| `/openarche:config` | View or update configuration |
| `/openarche:save` | Manually save an insight from the current conversation |
| `/openarche:list` | List recently stored memories |
| `/openarche:search` | Search the memory library with a query |
| `/openarche:forget` | Delete a memory by ID |
| `/openarche:reindex` | Rebuild vector index after switching embedding models |

## Configuration

Run `/openarche:config` to view and change settings interactively.

Config file: `<home>/.claude/openarche/config.json`

```json
{
  "embedding": {
    "provider": "local",
    "localModel": "Xenova/multilingual-e5-small",
    "remoteProvider": "",
    "remoteModel": "",
    "remoteApiKey": ""
  },
  "retrieval": {
    "threshold": 0.80,
    "topK": 3,
    "maxInjectChars": 3000
  },
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "minQualityScore": 0.6,
    "bootstrapConcurrency": 3
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `embedding.provider` | `local` | `local` or `openai`. After switching, run `/openarche:reindex` |
| `embedding.localModel` | `Xenova/multilingual-e5-small` | Local embedding model, 100+ languages, ~120MB |
| `embedding.remoteProvider` | `""` | Remote embedding provider (e.g. `openai`) |
| `embedding.remoteModel` | `""` | Remote embedding model (e.g. `text-embedding-3-small`) |
| `embedding.remoteApiKey` | `""` | API key for OpenAI embedding (required when using remote) |
| `retrieval.threshold` | `0.80` | Cosine similarity cutoff. Higher = fewer but more relevant results |
| `retrieval.topK` | `3` | Max seed memories injected per prompt |
| `retrieval.maxInjectChars` | `3000` | Max injected characters per prompt |
| `extraction.model` | `claude-haiku-4-5-20251001` | Claude model used for extraction |
| `extraction.minQualityScore` | `0.6` | Discard insights below this quality score |
| `extraction.bootstrapConcurrency` | `3` | Parallel transcripts during bootstrap |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Claude Code CLI                     │
│                                                          │
│   UserPromptSubmit hook           Stop hook              │
│           │                           │                  │
└───────────┼───────────────────────────┼──────────────────┘
            │                           │
            ▼                           ▼
    hooks/prompt.ts              hooks/stop.ts
            │                           │
            │ embed + search            │ spawn detached
            ▼                           ▼
     engine/search.ts         extractor/index.ts
     ┌─────────────┐          ┌──────────────────┐
     │ cosine sim  │          │  Claude Haiku API│
     │ BFS expand  │          │  (ANTHROPIC_*)   │
     └──────┬──────┘          └────────┬─────────┘
            │                          │
            │ stdout XML               │ write .md
            ▼                          ▼
    <arche_context>           engine/writer.ts
    (Claude context)           engine/graph.ts

    hooks/status-line.ts  ←  state.json
```

## Data flow

### Injection (every prompt)

```
hooks/prompt.ts
  ├─ read transcript → get last human message
  ├─ embed(prompt)            # ~5ms local / ~200ms remote
  ├─ vectorSearch()           # cosine sim > threshold, top-K
  ├─ bfsExpand()              # one-hop BFS over links
  ├─ read .md bodies, truncate to maxInjectChars
  ├─ stdout → <arche_context> XML injected before user prompt:
  │     <arche_context matched="N" total="M">
  │       <memory id="..." type="..." score="..." age="Xd" project="..." via="vector">
  │         memory body
  │       </memory>
  │       ...
  │     </arche_context>
  └─ update state.json + score/access_count
```

### Extraction (after each conversation)

```
hooks/stop.ts
  ├─ scan all unprocessed .jsonl under ~/.claude/projects/
  ├─ skip: already in processed.json
  ├─ skip: file mtime < 12h (conversation still active)
  ├─ skip: no tool_use / user turns < 5
  ├─ write payload to temp file per qualifying transcript
  ├─ spawn detached extractor/index.ts <tmpFile> per file
  └─ child.unref() → main process exits immediately

[background process] extractor/index.ts
  ├─ callHaiku(transcript)    # Anthropic API
  ├─ filter quality < minQualityScore
  ├─ embed(title + trigger_context)
  ├─ cosine >= 0.95 → skip (near-exact duplicate)
  ├─ cosine >= 0.85 → upsertMemory()   # overwrite existing .md + updateMemory()
  ├─ else → writeMemory()              # write .md + appendMemory()
  ├─ matchLinksHints() + buildLinks()  # bidirectional edges
  └─ update state.json(totalMemories)
```

## Storage

```
<home>/.claude/openarche/
├── memories/
│   ├── abc123.md        # YAML frontmatter + free-form body
│   └── def456.md
├── index.json           # Metadata + float32 embedding vectors
├── processed.json       # Processed transcript paths (dedup)
├── state.json           # Live state bridge between hooks and StatusLine
├── models/              # Local embedding model cache
└── config.json          # User configuration
```

`<home>` is your user home directory (`~` on macOS/Linux, `%USERPROFILE%` on Windows).

## Memory types

Each memory has a type (what kind of insight) and a structure (how the logic is organized) — independent of each other:

| Type | Meaning |
|------|---------|
| `solution` | How to solve a specific technical problem |
| `decision` | Architecture or technology choice with reasoning |
| `pattern` | Reusable code or design pattern |
| `gotcha` | Non-obvious behavior, warning, or trap |

| Structure | Meaning |
|-----------|---------|
| `atomic` | Single fact, one paragraph |
| `linear` | Ordered steps (trigger → root cause → steps → boundary conditions) |
| `tree` | Decision branches (scenario → tree → choice → reconsider when) |
| `graph` | Concept network, bidirectionally linked to other memories |

## License

MIT
