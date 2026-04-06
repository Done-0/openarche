# OpenArche [![English](https://img.shields.io/badge/Docs-English-red?style=flat-square)](README.md) [![简体中文](https://img.shields.io/badge/文档-简体中文-blue?style=flat-square)](README_ZH.md)

OpenArche is a harness-first Claude Code plugin for non-trivial engineering work. It keeps complex tasks from closing before planning, validation, review, and closeout are explicit.

## Features

- `Task grading`: decides whether a task stays light or enters harness control
- `Embedding-based routing`: uses the configured embedding backend to separate plain questions from execution work without language-specific keyword lists
- `Persistent sessions`: materializes `.openarche/sessions/<task-id>/state.json` only when execution work actually starts
- `Stage gates`: keeps validation, review, and maintenance open until they are actually closed
- `Context injection`: adds current task state, gate reasons, and relevant local knowledge
- `Knowledge recall`: retrieves repository-local knowledge first, then global knowledge, through embeddings and link expansion
- `Background closeout`: captures reusable knowledge after the task stops

## Installation

1. Add the marketplace entry:

```text
/plugin marketplace add Done-0/openarche
```

2. Install the plugin:

```text
/plugin install openarche
```

3. Reload plugins:

```text
/reload-plugin
```

4. Run setup:

```text
/openarche:setup
```

If you use local embeddings, the first successful run may need network access to download the model files. If you prefer API-backed embeddings, switch to `remote` in `/openarche:config`.

## How It Works

1. Use Claude Code as usual.
2. Light tasks stay lightweight. Non-light tasks receive harness context first, and `.openarche/sessions/<task-id>/state.json` is materialized only for explicit execution work or after write-capable or execution-capable tool activity starts.
3. OpenArche tells Claude Code why the task was gated, which stages are still open, and which local knowledge is relevant.
4. The status line and session state keep showing what is still open, so the task does not quietly close too early.
5. Validation, review, and maintenance stay open until the required evidence is recorded inside the current session state and evidence directory.
6. When the task stops, OpenArche closes out the session and queues reusable knowledge capture for that transcript.

## Commands

| Command | Description |
|---|---|
| `/openarche:setup` | Prepare OpenArche for automatic task interception, harness sessions, and optional knowledge import |
| `/openarche:config` | View or update grouped capability configuration |
| `/openarche:plan` | Produce an execution plan with objective, acceptance criteria, and explicit task coverage |
| `/openarche:run` | Turn a plan into an execution checklist |
| `/openarche:validate` | Define browser and task validation expectations |
| `/openarche:observe` | Define investigation queries and targets |
| `/openarche:review` | Drive self-review, local agent review, cloud agent review, and repair loops |
| `/openarche:maintain` | Run maintenance and drift-reduction workflows |
| `/openarche:knowledge-search` | Search reusable engineering knowledge |
| `/openarche:knowledge-save` | Persist reusable engineering knowledge explicitly |
| `/openarche:knowledge-reindex` | Rebuild the knowledge vector index after embedding model changes |

## Configuration

Config file:

```text
<home>/.claude/openarche/config.json
```

- `knowledge.embedding.provider`: `local` or `remote`
- `orchestration`: auto-injection, deferred materialization, and explicit command policy
- `knowledge.embedding.localModel`: used only when the provider is `local`
- `knowledge.embedding.remoteModel`, `knowledge.embedding.remoteApiKey`, `knowledge.embedding.remoteBaseUrl`: used only when the provider is `remote`
- `knowledge.retrieval`: recall threshold, recall fanout, and injection budget
- `knowledge.extraction`: extraction model and capture concurrency
- `execution`: isolation strategy and base ref
  OpenArche records the isolation plan by default. It does not automatically create git worktrees or switch branches in your repository.
- `validation.browser`: required browser evidence
- `observability`: logs, metrics, and traces requirements
- `review`: self-review, local agent review, cloud agent review, repair loops
- `maintenance`: quality and drift cleanup

If the embedding provider changes, run:

```text
/openarche:knowledge-reindex
```

## Runtime Layout

Global OpenArche state lives under:

```text
<home>/.claude/openarche/
├── config.json
├── state.json
├── capture-log.json
├── decision-log.jsonl
├── prototype-cache.json
├── index.json
└── knowledge/
```

Repository-scoped runtime state lives under:

```text
<repo>/.openarche/
├── sessions/
│   └── <task-id>/
│       ├── state.json
│       └── evidence/
└── knowledge/
    ├── index.json
    └── <entry-id>.md
```

- Session state, validation, review, and maintenance all live inside `sessions/<task-id>/state.json`.
- Mechanical review command output is written into `sessions/<task-id>/evidence/`.
- Closeout for repository tasks writes reusable knowledge into repository-local `.openarche/knowledge/`.
- Prompt recall prefers repository-local knowledge and falls back to the global store.
- `capture-log.json` stores transcript fingerprints and `closeout:<fingerprint>` queue entries instead of raw paths.

## Architecture

```text
src/
├── product/             # product manifest and capability readiness
├── planning/            # execution plans and acceptance criteria
├── execution/           # isolated task-session definition
├── validation/          # validation protocols and browser evidence gates
├── observability/       # logs, metrics, and traces evidence gates
├── review/              # mechanical review gates and repair-loop state
├── maintenance/         # task closeout and follow-up cleanup state
├── orchestration/       # harness assembly, session sync, Claude-facing context
├── knowledge/           # extraction, indexing, retrieval, and writing
└── integrations/claude/ # Claude Code adapters only
```
