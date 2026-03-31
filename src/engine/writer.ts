import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appendMemory, updateMemory } from './index-store.js';
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

interface UpsertMemoryOptions {
  memoriesDir: string;
  indexPath: string;
  existingId: string;
  entry: ArcheEntry;
  body: string;
}

export async function upsertMemory(opts: UpsertMemoryOptions): Promise<void> {
  const { memoriesDir, indexPath, existingId, entry, body } = opts;
  const content = toFrontmatter(entry) + body;
  await writeFile(join(memoriesDir, `${existingId}.md`), content, 'utf8');
  await updateMemory(indexPath, existingId, { ...entry, id: existingId });
}

export async function writeMemory(opts: WriteMemoryOptions): Promise<void> {
  const { memoriesDir, indexPath, entry, body } = opts;
  const content = toFrontmatter(entry) + body;
  await writeFile(join(memoriesDir, `${entry.id}.md`), content, 'utf8');
  await appendMemory(indexPath, entry);
}
