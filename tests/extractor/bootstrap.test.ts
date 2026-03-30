import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findUnprocessedTranscripts } from '../../src/extractor/bootstrap.js';

test('findUnprocessedTranscripts returns empty array when dir missing', async () => {
  const result = await findUnprocessedTranscripts('/nonexistent/path/xyz', new Set());
  assert.deepEqual(result, []);
});

test('findUnprocessedTranscripts finds jsonl files in project subdirs', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-bs-'));
  try {
    const proj = join(base, 'my-project');
    await mkdir(proj, { recursive: true });
    await writeFile(join(proj, 'session1.jsonl'), 'line1\nline2');
    await writeFile(join(proj, 'notes.txt'), 'ignore me');
    const result = await findUnprocessedTranscripts(base, new Set());
    assert.equal(result.length, 1);
    assert.ok(result[0].endsWith('session1.jsonl'));
  } finally {
    await rm(base, { recursive: true });
  }
});

test('findUnprocessedTranscripts skips already-processed paths', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-bs-skip-'));
  try {
    const proj = join(base, 'proj');
    await mkdir(proj, { recursive: true });
    const filePath = join(proj, 'session.jsonl');
    await writeFile(filePath, 'data');
    const result = await findUnprocessedTranscripts(base, new Set([filePath]));
    assert.deepEqual(result, []);
  } finally {
    await rm(base, { recursive: true });
  }
});

test('findUnprocessedTranscripts sorts by mtime descending', async () => {
  const base = await mkdtemp(join(tmpdir(), 'oe-bs-sort-'));
  try {
    const proj = join(base, 'proj');
    await mkdir(proj, { recursive: true });
    await writeFile(join(proj, 'old.jsonl'), 'old');
    await new Promise(r => setTimeout(r, 20));
    await writeFile(join(proj, 'new.jsonl'), 'new');
    const result = await findUnprocessedTranscripts(base, new Set());
    assert.equal(result.length, 2);
    assert.ok(result[0].endsWith('new.jsonl'), `expected new.jsonl first, got ${result[0]}`);
  } finally {
    await rm(base, { recursive: true });
  }
});
