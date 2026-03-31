import { cosineSimilarity } from './embedder.js';
import type { ArcheEntry, ArcheIndex } from '../types.js';

export interface SearchResult {
  entry: ArcheEntry;
  similarity: number;
  via: 'vector' | 'link';
}

export function vectorSearch(
  index: ArcheIndex,
  queryEmbedding: number[],
  threshold: number,
  topK: number,
  cwd?: string
): SearchResult[] {
  const crossProjectThreshold = Math.min(threshold + 0.08, 0.95);
  return index.memories
    .map(entry => ({ entry, similarity: cosineSimilarity(queryEmbedding, entry.embedding), via: 'vector' as const }))
    .filter(r => {
      const isSameProject = cwd && r.entry.source_project && r.entry.source_project === cwd;
      return r.similarity >= (isSameProject ? threshold : crossProjectThreshold);
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export function bfsExpand(
  seeds: SearchResult[],
  index: ArcheIndex
): SearchResult[] {
  const visited = new Set<string>(seeds.map(s => s.entry.id));
  const entryMap = new Map<string, ArcheEntry>(index.memories.map(e => [e.id, e]));
  const neighbors: SearchResult[] = [];

  for (const seed of seeds) {
    for (const neighborId of seed.entry.links) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const neighbor = entryMap.get(neighborId);
      if (neighbor) {
        neighbors.push({ entry: neighbor, similarity: neighbor.score, via: 'link' });
      }
    }
  }

  return neighbors.sort((a, b) => b.entry.score - a.entry.score);
}

export function retrieve(
  index: ArcheIndex,
  queryEmbedding: number[],
  threshold: number,
  topK: number,
  cwd?: string
): SearchResult[] {
  const seeds = vectorSearch(index, queryEmbedding, threshold, topK, cwd);
  const neighbors = bfsExpand(seeds, index);
  return [...seeds, ...neighbors];
}
