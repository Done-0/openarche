import { cosineSimilarity } from './embedder.js';
import type { ArcheEntry, ArcheIndex, AppConfig } from '../types.js';

export interface SearchResult {
  entry: ArcheEntry;
  similarity: number;
  via: 'vector' | 'link';
}

export interface RerankingConfig {
  enabled: boolean;
  provider?: 'local' | 'remote';
  remoteModel?: string;
  remoteApiKey?: string;
  remoteBaseUrl?: string;
  weights: {
    similarity: number;
    quality: number;
    recency: number;
    frequency: number;
  };
}

export function vectorSearch(
  index: ArcheIndex,
  queryEmbedding: number[],
  threshold: number,
  topK: number,
  cwd?: string,
  reranking?: RerankingConfig,
  query?: string
): SearchResult[] | Promise<SearchResult[]> {
  const crossProjectThreshold = Math.min(threshold + 0.08, 0.95);
  const results = index.memories
    .map(entry => ({ entry, similarity: cosineSimilarity(queryEmbedding, entry.embedding), via: 'vector' as const }))
    .filter(r => {
      const isOtherProject = cwd && r.entry.source_project && r.entry.source_project !== cwd;
      return r.similarity >= (isOtherProject ? crossProjectThreshold : threshold);
    });

  if (results.length === 0) {
    return [];
  }

  if (reranking?.enabled && reranking.provider === 'remote' && query) {
    if (!reranking.remoteBaseUrl || !reranking.remoteModel || !reranking.remoteApiKey) {
      throw new Error('Remote reranking requires remoteBaseUrl, remoteModel, and remoteApiKey');
    }
    const baseUrl = reranking.remoteBaseUrl.replace(/\/$/, '');
    const documents = results.map(r => r.entry.title + ' ' + r.entry.trigger_context);
    return fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${reranking.remoteApiKey}`,
      },
      body: JSON.stringify({
        model: reranking.remoteModel,
        query,
        documents,
        top_n: topK,
      }),
    })
      .then(resp => {
        if (!resp.ok) {
          throw new Error(`Rerank API error: ${resp.status} ${resp.statusText}`);
        }
        return resp.json() as Promise<{ results: Array<{ index: number; relevance_score: number }> }>;
      })
      .then(json => {
        if (!json.results || json.results.length === 0) {
          return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
        }
        return json.results
          .filter(r => r.index >= 0 && r.index < results.length)
          .map(r => ({
            ...results[r.index],
            similarity: r.relevance_score,
          }));
      })
      .catch(err => {
        console.error('Rerank API failed, falling back to vector search:', err);
        return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
      });
  }

  if (reranking?.enabled && reranking.provider === 'local') {
    const w = reranking.weights;
    const now = Date.now();
    const maxAccessCount = index.memories.length > 0 ? Math.max(...index.memories.map(e => e.access_count), 1) : 1;
    return results
      .sort((a, b) => {
        const scoreA = w.similarity * a.similarity +
          w.quality * a.entry.quality +
          w.recency * (a.entry.last_accessed ? Math.exp(-(now - a.entry.last_accessed) / (1000 * 60 * 60 * 24 * 30)) : 0) +
          w.frequency * (maxAccessCount > 0 ? Math.min(a.entry.access_count / maxAccessCount, 1) : 0);
        const scoreB = w.similarity * b.similarity +
          w.quality * b.entry.quality +
          w.recency * (b.entry.last_accessed ? Math.exp(-(now - b.entry.last_accessed) / (1000 * 60 * 60 * 24 * 30)) : 0) +
          w.frequency * (maxAccessCount > 0 ? Math.min(b.entry.access_count / maxAccessCount, 1) : 0);
        return scoreB - scoreA;
      })
      .slice(0, topK);
  }

  return results
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
  cwd?: string,
  reranking?: RerankingConfig,
  query?: string
): SearchResult[] | Promise<SearchResult[]> {
  const seeds = vectorSearch(index, queryEmbedding, threshold, topK, cwd, reranking, query);
  if (seeds instanceof Promise) {
    return seeds.then(s => {
      const neighbors = bfsExpand(s, index);
      return [...s, ...neighbors];
    });
  }
  const neighbors = bfsExpand(seeds, index);
  return [...seeds, ...neighbors];
}
