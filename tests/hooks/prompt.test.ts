import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getLastHumanMessage } from '../../src/hooks/prompt.js';
import { loadIndex, saveIndex } from '../../src/engine/index-store.js';
import type { ArcheEntry, ArcheIndex } from '../../src/types.js';

function makeEntry(id: string, score = 1.0): ArcheEntry {
  return {
    id, title: 'test', type: 'solution', structure: 'atomic',
    tags: [], links: [], score, access_count: 0,
    source_project: null, trigger_context: 'test',
    quality: 0.8, created_at: Date.now(), last_accessed: null,
    embedding: [1, 0],
  };
}

function makeTranscriptLine(role: string, content: string): string {
  return JSON.stringify({ message: { role, content } });
}

test('getLastHumanMessage returns last user text message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph-'));
  try {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, [
      makeTranscriptLine('assistant', 'Hello'),
      makeTranscriptLine('user', 'fix the bug'),
      makeTranscriptLine('assistant', 'Done'),
    ].join('\n'), 'utf8');
    const result = await getLastHumanMessage(path);
    assert.equal(result, 'fix the bug');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getLastHumanMessage returns last user message when multiple exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph2-'));
  try {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, [
      makeTranscriptLine('user', 'first message'),
      makeTranscriptLine('assistant', 'response'),
      makeTranscriptLine('user', 'second message'),
    ].join('\n'), 'utf8');
    const result = await getLastHumanMessage(path);
    assert.equal(result, 'second message');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getLastHumanMessage handles array content blocks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph3-'));
  try {
    const path = join(dir, 'session.jsonl');
    const line = JSON.stringify({ message: { role: 'user', content: [{ type: 'text', text: 'array prompt' }] } });
    await writeFile(path, line, 'utf8');
    const result = await getLastHumanMessage(path);
    assert.equal(result, 'array prompt');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getLastHumanMessage returns null when no user message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph4-'));
  try {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, makeTranscriptLine('assistant', 'hello'), 'utf8');
    const result = await getLastHumanMessage(path);
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getLastHumanMessage returns null for missing file', async () => {
  const result = await getLastHumanMessage('/nonexistent/path.jsonl');
  assert.equal(result, null);
});

test('getLastHumanMessage skips malformed lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph5-'));
  try {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, [
      'not json',
      makeTranscriptLine('user', 'valid message'),
      '{broken',
    ].join('\n'), 'utf8');
    const result = await getLastHumanMessage(path);
    assert.equal(result, 'valid message');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('batch score update increments all matched memories in one write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph6-'));
  try {
    const indexPath = join(dir, 'index.json');
    const index: ArcheIndex = { version: 1, memories: [makeEntry('a', 1.0), makeEntry('b', 1.0), makeEntry('c', 1.0)] };
    await saveIndex(indexPath, index);

    const freshIndex = await loadIndex(indexPath);
    const toUpdate = ['a', 'b'];
    const now = Date.now();
    for (const id of toUpdate) {
      const i = freshIndex.memories.findIndex(e => e.id === id);
      if (i >= 0) {
        freshIndex.memories[i].access_count += 1;
        freshIndex.memories[i].last_accessed = now;
        freshIndex.memories[i].score = Math.min(5.0, freshIndex.memories[i].score + 0.1);
      }
    }
    await saveIndex(indexPath, freshIndex);

    const result = await loadIndex(indexPath);
    assert.equal(result.memories.find(e => e.id === 'a')!.score, 1.1);
    assert.equal(result.memories.find(e => e.id === 'b')!.score, 1.1);
    assert.equal(result.memories.find(e => e.id === 'c')!.score, 1.0);
    assert.equal(result.memories.find(e => e.id === 'a')!.access_count, 1);
    assert.equal(result.memories.find(e => e.id === 'c')!.access_count, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('batch score update caps score at 5.0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-ph7-'));
  try {
    const indexPath = join(dir, 'index.json');
    await saveIndex(indexPath, { version: 1, memories: [makeEntry('a', 4.99)] });
    const freshIndex = await loadIndex(indexPath);
    const i = freshIndex.memories.findIndex(e => e.id === 'a');
    freshIndex.memories[i].score = Math.min(5.0, freshIndex.memories[i].score + 0.1);
    await saveIndex(indexPath, freshIndex);
    const result = await loadIndex(indexPath);
    assert.equal(result.memories[0].score, 5.0);
  } finally {
    await rm(dir, { recursive: true });
  }
});
