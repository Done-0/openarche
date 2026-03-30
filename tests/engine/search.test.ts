import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vectorSearch, bfsExpand, retrieve } from '../../src/engine/search.js';
import type { ArcheIndex, ArcheEntry } from '../../src/types.js';

function makeEntry(id: string, embedding: number[], links: string[] = [], score = 0.8): ArcheEntry {
  return {
    id, title: id, type: 'solution', structure: 'atomic',
    tags: [], links, score, access_count: 0,
    source_project: null, trigger_context: 'test',
    quality: 0.8, created_at: Date.now(), last_accessed: null,
    embedding,
  };
}

test('vectorSearch returns entries above threshold sorted by similarity', () => {
  const index: ArcheIndex = {
    version: 1,
    memories: [
      makeEntry('a', [1, 0]),
      makeEntry('b', [0, 1]),
      makeEntry('c', [0.9, 0.1]),
    ],
  };
  const results = vectorSearch(index, [1, 0], 0.7, 5);
  assert.equal(results[0].entry.id, 'a');
  assert.ok(results.every(r => r.similarity >= 0.7));
  assert.ok(results.every(r => r.via === 'vector'));
});

test('vectorSearch respects topK limit', () => {
  const index: ArcheIndex = {
    version: 1,
    memories: [
      makeEntry('a', [1, 0]),
      makeEntry('b', [0.9, 0.1]),
      makeEntry('c', [0.8, 0.2]),
    ],
  };
  const results = vectorSearch(index, [1, 0], 0.5, 2);
  assert.equal(results.length, 2);
});

test('bfsExpand returns linked neighbors not in seeds', () => {
  const a = makeEntry('a', [1, 0], ['b']);
  const b = makeEntry('b', [0, 1], ['a']);
  const c = makeEntry('c', [0.5, 0.5]);
  const index: ArcheIndex = { version: 1, memories: [a, b, c] };
  const seeds = [{ entry: a, similarity: 0.9, via: 'vector' as const }];
  const neighbors = bfsExpand(seeds, index);
  assert.equal(neighbors.length, 1);
  assert.equal(neighbors[0].entry.id, 'b');
  assert.equal(neighbors[0].via, 'link');
});

test('bfsExpand does not revisit seed nodes', () => {
  const a = makeEntry('a', [1, 0], ['b']);
  const b = makeEntry('b', [0, 1], ['a']);
  const index: ArcheIndex = { version: 1, memories: [a, b] };
  const seeds = [
    { entry: a, similarity: 0.9, via: 'vector' as const },
    { entry: b, similarity: 0.8, via: 'vector' as const },
  ];
  const neighbors = bfsExpand(seeds, index);
  assert.equal(neighbors.length, 0);
});

test('retrieve returns seeds followed by neighbors', () => {
  const a = makeEntry('a', [1, 0], ['b']);
  const b = makeEntry('b', [0.1, 0.9]);
  const index: ArcheIndex = { version: 1, memories: [a, b] };
  const results = retrieve(index, [1, 0], 0.7, 5);
  assert.ok(results.some(r => r.via === 'vector'));
  assert.ok(results.some(r => r.via === 'link'));
});
