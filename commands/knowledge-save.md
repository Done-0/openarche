---
description: Save a durable engineering insight into OpenArche knowledge
allowed-tools: Read, Write, Bash
---

Use this command to save one explicit piece of reusable engineering knowledge into the local OpenArche store.
For repository-specific work, prefer the repository-local store at `.openarche/knowledge/`.
Use the global store only when the user is saving cross-project knowledge on purpose.

What to save:

- durable decisions
- reusable patterns
- non-obvious gotchas
- high-signal fixes

Do not save:

- one-off chatter
- unresolved ideas
- project-specific notes with no reuse value
- obvious facts that do not improve future execution quality

When writing a knowledge item, require these fields:

- `title`
- `type`: `solution`, `decision`, `pattern`, or `gotcha`
- `structure`: `atomic`, `linear`, `tree`, or `graph`
- `trigger_context`
- `tags`
- `body`

When saving:

1. Find the correct OpenArche data directory.
2. Read and validate the current config.
3. Load the current `index.json`.
4. Build the embedding from the same recall text the product uses: `title + " " + trigger_context`.
5. Create a new knowledge id unless the user is explicitly updating an existing item.
6. Write the markdown file under `<store>/knowledge/<id>.md`.
7. Write the matching index entry.

If the user is updating an existing knowledge item:

- keep the existing id stable
- keep the file name and index id aligned
- do not silently create a duplicate entry

When reporting back:

- say whether a new item was created or an existing item was updated
- show the id
- summarize the saved title, type, and trigger context
