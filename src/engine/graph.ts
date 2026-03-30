import { cosineSimilarity } from './embedder.js';
import type { ArcheIndex } from '../types.js';

export function buildLinks(
  index: ArcheIndex,
  newId: string,
  targetIds: string[]
): void {
  const newEntry = index.memories.find(e => e.id === newId);
  if (!newEntry) return;

  for (const targetId of targetIds) {
    const target = index.memories.find(e => e.id === targetId);
    if (!target) continue;

    if (!newEntry.links.includes(targetId)) {
      newEntry.links.push(targetId);
    }
    if (!target.links.includes(newId)) {
      target.links.push(newId);
    }
  }
}

export function removeFromLinks(index: ArcheIndex, removedId: string): void {
  for (const entry of index.memories) {
    entry.links = entry.links.filter(id => id !== removedId);
  }
}

export function matchLinksHints(
  index: ArcheIndex,
  hintEmbeddings: number[][],
  threshold: number = 0.80
): string[] {
  const matched = new Set<string>();
  for (const hintEmbedding of hintEmbeddings) {
    for (const entry of index.memories) {
      if (cosineSimilarity(hintEmbedding, entry.embedding) >= threshold) {
        matched.add(entry.id);
      }
    }
  }
  return Array.from(matched);
}
