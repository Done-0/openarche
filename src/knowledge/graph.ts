import { cosineSimilarity } from './embedding.js';
import type { KnowledgeIndex } from '../types.js';

export function buildLinks(
  index: KnowledgeIndex,
  newId: string,
  targetIds: string[]
): void {
  const newEntry = index.entries.find(e => e.id === newId);
  if (!newEntry) return;

  for (const targetId of targetIds) {
    const target = index.entries.find(e => e.id === targetId);
    if (!target) continue;

    if (!newEntry.links.includes(targetId)) {
      newEntry.links.push(targetId);
    }
    if (!target.links.includes(newId)) {
      target.links.push(newId);
    }
  }
}

export function matchLinksHints(
  index: KnowledgeIndex,
  hintEmbeddings: number[][],
  threshold: number = 0.80
): string[] {
  const matched = new Set<string>();
  for (const hintEmbedding of hintEmbeddings) {
    for (const entry of index.entries) {
      if (cosineSimilarity(hintEmbedding, entry.embedding) >= threshold) {
        matched.add(entry.id);
      }
    }
  }
  return Array.from(matched);
}
