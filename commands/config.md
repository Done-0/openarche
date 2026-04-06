---
description: View or update OpenArche configuration
allowed-tools: Bash, Read, Write
---

Use this command to inspect or change the single source of truth for OpenArche configuration.

Get the config file path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.claude','openarche','config.json'));"
```

Read that file.

- If it does not exist, tell the user to run `/openarche:setup` first.
- If it exists but is invalid JSON or does not match the required config shape, explain that the config is invalid and must be corrected before OpenArche can run reliably. Do not pretend the current file is usable.

When showing the current config, group it by section and include the config path:

**Orchestration**
- `orchestration.autoInject`
- `orchestration.persistAfterFirstToolUse`
- `orchestration.readOnlyCommands`
- `orchestration.explicitSessionCommands`
- `orchestration.injectOnlyIntentThreshold`
- `orchestration.materializeIntentThreshold`

**Knowledge**
- `knowledge.embedding.provider`
- If provider is `local`, show `knowledge.embedding.localModel`
- If provider is `remote`, show `knowledge.embedding.remoteModel` and `knowledge.embedding.remoteBaseUrl`
- Never print the full `knowledge.embedding.remoteApiKey`; show it as redacted or masked
- `knowledge.retrieval.threshold`
- `knowledge.retrieval.topK`
- `knowledge.retrieval.maxInjectChars`
- `knowledge.extraction.model`
- `knowledge.extraction.minQualityScore`
- `knowledge.extraction.captureConcurrency`

**Execution**
- `execution.isolationStrategy` — `git-worktree` or `git-branch`
- `execution.baseRef`

**Validation**
- `validation.browser.enabled`
- `validation.browser.captureDomSnapshot`
- `validation.browser.captureScreenshot`
- `validation.browser.captureNavigation`

**Observability**
- `observability.enabled`
- `observability.logs`
- `observability.metrics`
- `observability.traces`

**Review**
- `review.localSelfReview`
- `review.localAgentReview`
- `review.cloudAgentReview`
- `review.repairLoops`

**Maintenance**
- `maintenance.qualitySweep`
- `maintenance.driftSweep`

When editing:

- Keep `orchestration.materializeIntentThreshold` greater than or equal to `orchestration.injectOnlyIntentThreshold`.
- Only write fields that belong to the selected embedding provider.
- If switching to `local`, remove remote-only embedding fields.
- If switching to `remote`, remove `localModel` and require `remoteModel`, `remoteApiKey`, and `remoteBaseUrl`.
- Keep the final file fully valid. Do not leave partial config.
- If the user selects `local`, remind them that the first successful embedding call may need network access to download model files.
- If the user edits `remoteApiKey`, accept the new value but do not echo the full key back in the response.

After writing the file back:

- Tell the user exactly which fields changed.
- If any embedding provider or embedding model field changed, remind the user:
> You changed the knowledge embedding settings. Run `/openarche:knowledge-reindex` to rebuild the vector index.
