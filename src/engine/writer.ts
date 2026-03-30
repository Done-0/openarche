import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appendMemory } from './index-store.js';
import type { ArcheEntry } from '../types.js';

interface WriteMemoryOptions {
  memoriesDir: string;
  indexPath: string;
  entry: ArcheEntry;
  body: string;
}

function toFrontmatter(entry: ArcheEntry): string {
  return [
    '---',
    `id: ${entry.id}`,
    `type: ${entry.type}`,
    `structure: ${entry.structure}`,
    `title: ${entry.title}`,
    `trigger_context: ${entry.trigger_context}`,
    `tags: [${entry.tags.join(', ')}]`,
    `links: [${entry.links.join(', ')}]`,
    `score: ${entry.score}`,
    `quality: ${entry.quality}`,
    `source: ${entry.source_project ?? 'null'}`,
    `created: ${new Date(entry.created_at).toISOString().slice(0, 10)}`,
    '---',
    '',
  ].join('\n');
}

export async function writeMemory(opts: WriteMemoryOptions): Promise<void> {
  const { memoriesDir, indexPath, entry, body } = opts;
  const content = toFrontmatter(entry) + body;
  await writeFile(join(memoriesDir, `${entry.id}.md`), content, 'utf8');
  await appendMemory(indexPath, entry);
}
