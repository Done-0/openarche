import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadIndex, saveIndex, appendMemory, updateMemory, removeMemory } from '../../src/engine/index-store.js';
import type { ArcheEntry } from '../../src/types.js';

function makeEntry(id: string): ArcheEntry {
  return {
    id, title: 'Test', type: 'solution', structure: 'atomic',
    tags: [], links: [], score: 0.8, access_count: 0,
    source_project: null, trigger_context: 'when testing',
    quality: 0.8, created_at: Date.now(), last_accessed: null,
    embedding: [0.1, 0.2, 0.3],
  };
}

test('loadIndex returns empty index when file missing', async () => {
  const index = await loadIndex('/nonexistent/index.json');
  assert.equal(index.version, 1);
  assert.deepEqual(index.memories, []);
});

test('saveIndex and loadIndex round-trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-idx-'));
  try {
    const indexPath = join(dir, 'index.json');
    const entry = makeEntry('abc1');
    await saveIndex(indexPath, { version: 1, memories: [entry] });
    const loaded = await loadIndex(indexPath);
    assert.equal(loaded.memories.length, 1);
    assert.equal(loaded.memories[0].id, 'abc1');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('appendMemory adds entry to index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-app-'));
  try {
    const indexPath = join(dir, 'index.json');
    await appendMemory(indexPath, makeEntry('def2'));
    const index = await loadIndex(indexPath);
    assert.equal(index.memories.length, 1);
    assert.equal(index.memories[0].id, 'def2');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('appendMemory does not duplicate entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-dup-'));
  try {
    const indexPath = join(dir, 'index.json');
    const entry = makeEntry('ghi3');
    await appendMemory(indexPath, entry);
    await appendMemory(indexPath, entry);
    const index = await loadIndex(indexPath);
    assert.equal(index.memories.length, 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('updateMemory patches fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-upd-'));
  try {
    const indexPath = join(dir, 'index.json');
    const entry = makeEntry('jkl4');
    await saveIndex(indexPath, { version: 1, memories: [entry] });
    await updateMemory(indexPath, 'jkl4', { score: 1.5, access_count: 3 });
    const index = await loadIndex(indexPath);
    assert.equal(index.memories[0].score, 1.5);
    assert.equal(index.memories[0].access_count, 3);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('removeMemory deletes entry from index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-rem-'));
  try {
    const indexPath = join(dir, 'index.json');
    await saveIndex(indexPath, { version: 1, memories: [makeEntry('mno5'), makeEntry('pqr6')] });
    await removeMemory(indexPath, 'mno5');
    const index = await loadIndex(indexPath);
    assert.equal(index.memories.length, 1);
    assert.equal(index.memories[0].id, 'pqr6');
  } finally {
    await rm(dir, { recursive: true });
  }
});
