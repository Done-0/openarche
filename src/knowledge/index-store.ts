import { open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import type { KnowledgeEntry, KnowledgeIndex } from '../types.js';

const EMPTY_INDEX: KnowledgeIndex = { version: 1, entries: [] };

function isValidEntry(entry: unknown): entry is KnowledgeEntry {
  if (!entry || typeof entry !== 'object') return false;
  const value = entry as Record<string, unknown>;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.type === 'solution' || value.type === 'decision' || value.type === 'pattern' || value.type === 'gotcha')
    && (value.structure === 'atomic' || value.structure === 'linear' || value.structure === 'tree' || value.structure === 'graph')
    && Array.isArray(value.tags)
    && value.tags.every(item => typeof item === 'string')
    && Array.isArray(value.links)
    && value.links.every(item => typeof item === 'string')
    && typeof value.score === 'number'
    && typeof value.access_count === 'number'
    && (typeof value.source_project === 'string' || value.source_project === null)
    && typeof value.trigger_context === 'string'
    && typeof value.quality === 'number'
    && !!value.quality_breakdown
    && typeof (value.quality_breakdown as Record<string, unknown>).reusability === 'number'
    && typeof (value.quality_breakdown as Record<string, unknown>).non_obviousness === 'number'
    && typeof (value.quality_breakdown as Record<string, unknown>).clarity === 'number'
    && typeof (value.quality_breakdown as Record<string, unknown>).completeness === 'number'
    && typeof value.created_at === 'number'
    && (typeof value.last_accessed === 'number' || value.last_accessed === null)
    && Array.isArray(value.embedding)
    && value.embedding.every(item => typeof item === 'number');
}

async function acquireIndexLock(lockPath: string): Promise<void> {
  let waited = 0;
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      if (waited >= 3000) {
        throw new Error(`Timed out waiting for index lock: ${lockPath}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
      waited += 50;
    }
  }
}

export async function loadIndex(indexPath: string): Promise<KnowledgeIndex> {
  try {
    const raw = await readFile(indexPath, 'utf8');
    const index = JSON.parse(raw) as KnowledgeIndex;
    if (index.version !== 1 || !Array.isArray(index.entries) || !index.entries.every(isValidEntry)) {
      throw new Error('Invalid index shape');
    }
    return index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return structuredClone(EMPTY_INDEX);
    }
    throw error;
  }
}

async function releaseIndexLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function saveIndex(indexPath: string, index: KnowledgeIndex, lockHeld = false): Promise<void> {
  if (index.version !== 1 || !Array.isArray(index.entries) || !index.entries.every(isValidEntry)) {
    throw new Error('Invalid index shape');
  }
  const lockPath = indexPath + '.lock';
  if (!lockHeld) {
    await acquireIndexLock(lockPath);
  }
  const tmp = indexPath + '.tmp';
  try {
    await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
    await rename(tmp, indexPath);
  } finally {
    if (!lockHeld) {
      await releaseIndexLock(lockPath);
    }
  }
}

export async function mutateIndex<T>(
  indexPath: string,
  mutate: (index: KnowledgeIndex) => Promise<T> | T
): Promise<T> {
  const lockPath = indexPath + '.lock';
  await acquireIndexLock(lockPath);
  try {
    const index = await loadIndex(indexPath);
    const result = await mutate(index);
    await saveIndex(indexPath, index, true);
    return result;
  } finally {
    await releaseIndexLock(lockPath);
  }
}
