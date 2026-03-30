import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ArcheEntry, ArcheIndex } from '../types.js';

const EMPTY_INDEX: ArcheIndex = { version: 1, memories: [] };

export async function loadIndex(indexPath: string): Promise<ArcheIndex> {
  try {
    const raw = await readFile(indexPath, 'utf8');
    return JSON.parse(raw) as ArcheIndex;
  } catch {
    return structuredClone(EMPTY_INDEX);
  }
}

export async function saveIndex(indexPath: string, index: ArcheIndex): Promise<void> {
  const tmp = indexPath + '.tmp';
  await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
  await rename(tmp, indexPath);
}

export async function appendMemory(indexPath: string, entry: ArcheEntry): Promise<void> {
  const lockPath = indexPath + '.lock';
  let waited = 0;
  while (existsSync(lockPath) && waited < 3000) {
    await new Promise(r => setTimeout(r, 50));
    waited += 50;
  }
  await writeFile(lockPath, '', 'utf8');
  try {
    const index = await loadIndex(indexPath);
    const exists = index.memories.some(e => e.id === entry.id);
    if (!exists) {
      index.memories.push(entry);
      await saveIndex(indexPath, index);
    }
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

export async function updateMemory(
  indexPath: string,
  id: string,
  patch: Partial<ArcheEntry>
): Promise<void> {
  const index = await loadIndex(indexPath);
  const i = index.memories.findIndex(e => e.id === id);
  if (i >= 0) {
    index.memories[i] = { ...index.memories[i], ...patch };
    await saveIndex(indexPath, index);
  }
}

export async function removeMemory(indexPath: string, id: string): Promise<void> {
  const index = await loadIndex(indexPath);
  index.memories = index.memories.filter(e => e.id !== id);
  await saveIndex(indexPath, index);
}
