---
description: Rebuild the knowledge index after changing embedding settings
allowed-tools: Bash, Read, Write
---

Use this command after changing any knowledge embedding provider or embedding model setting.

Treat this as a full index rebuild, not a partial patch.

Required behavior:

1. Find the OpenArche data directory.
2. Read and validate the current config.
   If the config is invalid, stop and tell the user to fix `/openarche:config` first.
3. Read the existing `index.json`.
   If the file is missing, treat it as an empty knowledge store.
   If the file exists but is invalid, stop and report that the index is corrupted.
4. For every knowledge entry in the index:
   - load the matching markdown file from `knowledge/<id>.md`
   - keep all metadata stable except the embedding vector
   - recompute the embedding from the same recall text used by the product: `title + " " + trigger_context`
5. Write one rebuilt `index.json` with the updated embeddings.
6. Do not rename entries, do not regenerate ids, and do not rewrite unrelated metadata.

When reporting back to the user:

- describe the action as rebuilding the knowledge index
- say how many entries were re-embedded
- say which embedding provider and model were used
- report any missing knowledge markdown files explicitly instead of silently skipping them
