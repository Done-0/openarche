import { cosineSimilarity } from './embedding.js';
import type { KnowledgeEntry, KnowledgeIndex } from '../types.js';

export interface SearchResult {
  entry: KnowledgeEntry;
  similarity: number;
  via: 'vector' | 'link';
}

function vectorSearch(
  index: KnowledgeIndex,
  queryEmbedding: number[],
  threshold: number,
  topK: number,
  cwd?: string
): SearchResult[] {
  const crossProjectThreshold = Math.min(threshold + 0.08, 0.95);
  const results = index.entries
    .map(entry => ({ entry, similarity: cosineSimilarity(queryEmbedding, entry.embedding), via: 'vector' as const }))
    .filter(r => {
      const isOtherProject = cwd && r.entry.source_project && r.entry.source_project !== cwd;
      return r.similarity >= (isOtherProject ? crossProjectThreshold : threshold);
    });

  if (results.length === 0) {
    return [];
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

function bfsExpand(
  seeds: SearchResult[],
  index: KnowledgeIndex
): SearchResult[] {
  const visited = new Set<string>(seeds.map(s => s.entry.id));
  const entryMap = new Map<string, KnowledgeEntry>(index.entries.map(e => [e.id, e]));
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
  index: KnowledgeIndex,
  queryEmbedding: number[],
  threshold: number,
  topK: number,
  cwd?: string
): SearchResult[] {
  const seeds = vectorSearch(index, queryEmbedding, threshold, topK, cwd);
  const neighbors = bfsExpand(seeds, index);
  return [...seeds, ...neighbors];
}
