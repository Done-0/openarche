import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeMemory } from '../../src/engine/writer.js';
import type { ArcheEntry } from '../../src/types.js';

function makeEntry(id: string): ArcheEntry {
  return {
    id, title: 'Atomic write pattern', type: 'solution', structure: 'atomic',
    tags: ['fs'], links: [], score: 0.9, access_count: 0,
    source_project: '/my/project', trigger_context: 'when writing files safely',
    quality: 0.9, created_at: new Date('2026-01-01').getTime(), last_accessed: null,
    embedding: [0.1, 0.2],
  };
}

test('writeMemory creates .md file with correct frontmatter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-wrt-'));
  try {
    const memoriesDir = join(dir, 'memories');
    const indexPath = join(dir, 'index.json');
    await import('node:fs/promises').then(fs => fs.mkdir(memoriesDir, { recursive: true }));
    const entry = makeEntry('test1');
    await writeMemory({ memoriesDir, indexPath, entry, body: 'Use tmp + rename.' });
    const content = await readFile(join(memoriesDir, 'test1.md'), 'utf8');
    assert.ok(content.includes('id: test1'));
    assert.ok(content.includes('type: solution'));
    assert.ok(content.includes('structure: atomic'));
    assert.ok(content.includes('title: Atomic write pattern'));
    assert.ok(content.includes('Use tmp + rename.'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('writeMemory appends entry to index.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-wrt2-'));
  try {
    const memoriesDir = join(dir, 'memories');
    const indexPath = join(dir, 'index.json');
    await import('node:fs/promises').then(fs => fs.mkdir(memoriesDir, { recursive: true }));
    await writeMemory({ memoriesDir, indexPath, entry: makeEntry('test2'), body: 'body' });
    const raw = await readFile(indexPath, 'utf8');
    const index = JSON.parse(raw);
    assert.equal(index.memories.length, 1);
    assert.equal(index.memories[0].id, 'test2');
  } finally {
    await rm(dir, { recursive: true });
  }
});
