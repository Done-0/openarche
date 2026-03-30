import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinks, removeFromLinks, matchLinksHints } from '../../src/engine/graph.js';
import type { ArcheIndex } from '../../src/types.js';

function makeIndex(entries: Array<{ id: string; embedding: number[]; links?: string[] }>): ArcheIndex {
  return {
    version: 1,
    memories: entries.map(e => ({
      id: e.id, title: e.id, type: 'solution' as const, structure: 'atomic' as const,
      tags: [], links: e.links ?? [], score: 0.8, access_count: 0,
      source_project: null, trigger_context: 'test',
      quality: 0.8, created_at: Date.now(), last_accessed: null,
      embedding: e.embedding,
    })),
  };
}

test('buildLinks creates bidirectional links', () => {
  const index = makeIndex([{ id: 'a', embedding: [1, 0] }, { id: 'b', embedding: [0, 1] }]);
  buildLinks(index, 'a', ['b']);
  assert.ok(index.memories.find(e => e.id === 'a')!.links.includes('b'));
  assert.ok(index.memories.find(e => e.id === 'b')!.links.includes('a'));
});

test('buildLinks does not duplicate links', () => {
  const index = makeIndex([{ id: 'a', embedding: [1, 0] }, { id: 'b', embedding: [0, 1] }]);
  buildLinks(index, 'a', ['b']);
  buildLinks(index, 'a', ['b']);
  const aLinks = index.memories.find(e => e.id === 'a')!.links;
  assert.equal(aLinks.filter(l => l === 'b').length, 1);
});

test('removeFromLinks removes id from all entries', () => {
  const index = makeIndex([
    { id: 'a', embedding: [1, 0], links: ['c'] },
    { id: 'b', embedding: [0, 1], links: ['c'] },
    { id: 'c', embedding: [0.5, 0.5] },
  ]);
  removeFromLinks(index, 'c');
  assert.deepEqual(index.memories.find(e => e.id === 'a')!.links, []);
  assert.deepEqual(index.memories.find(e => e.id === 'b')!.links, []);
});

test('matchLinksHints returns ids above threshold', () => {
  const index = makeIndex([
    { id: 'a', embedding: [1, 0] },
    { id: 'b', embedding: [0, 1] },
  ]);
  const matched = matchLinksHints(index, [[1, 0]], 0.8);
  assert.ok(matched.includes('a'));
  assert.ok(!matched.includes('b'));
});

test('matchLinksHints returns empty when nothing matches', () => {
  const index = makeIndex([{ id: 'a', embedding: [1, 0] }]);
  const matched = matchLinksHints(index, [[0, 1]], 0.99);
  assert.deepEqual(matched, []);
});
