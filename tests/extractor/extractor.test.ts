import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseExtractionResult, isValidCandidate } from '../../src/extractor/index.js';
import type { ExtractionCandidate } from '../../src/extractor/index.js';

function makeCandidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    title: 'ESM requires .js extensions',
    type: 'gotcha',
    structure: 'atomic',
    trigger_context: 'when importing TypeScript files in ESM project',
    body: 'Always use .js extension in imports even for .ts files.',
    tags: ['esm', 'typescript'],
    links_hint: ['module resolution'],
    quality: 0.85,
    ...overrides,
  };
}

test('parseExtractionResult returns candidates from valid JSON array', () => {
  const raw = JSON.stringify([makeCandidate()]);
  const result = parseExtractionResult(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ESM requires .js extensions');
  assert.equal(result[0].quality, 0.85);
});

test('parseExtractionResult returns multiple candidates', () => {
  const raw = JSON.stringify([makeCandidate(), makeCandidate({ title: 'second', quality: 0.7 })]);
  const result = parseExtractionResult(raw);
  assert.equal(result.length, 2);
  assert.equal(result[1].title, 'second');
});

test('parseExtractionResult returns empty array for invalid JSON', () => {
  assert.deepEqual(parseExtractionResult('not json'), []);
});

test('parseExtractionResult returns empty array for non-array JSON', () => {
  assert.deepEqual(parseExtractionResult('{"key":"value"}'), []);
});

test('parseExtractionResult returns empty array for empty array', () => {
  assert.deepEqual(parseExtractionResult('[]'), []);
});

test('parseExtractionResult returns empty for whitespace-only input', () => {
  assert.deepEqual(parseExtractionResult('   '), []);
});

test('parseExtractionResult handles JSON wrapped in markdown code block', () => {
  const result = parseExtractionResult('```json\n[]\n```');
  assert.deepEqual(result, []);
});

test('isValidCandidate accepts quality at threshold', () => {
  assert.equal(isValidCandidate(makeCandidate({ quality: 0.6 }), 0.6), true);
});

test('isValidCandidate accepts quality above threshold', () => {
  assert.equal(isValidCandidate(makeCandidate({ quality: 0.9 }), 0.6), true);
});

test('isValidCandidate rejects quality below threshold', () => {
  assert.equal(isValidCandidate(makeCandidate({ quality: 0.59 }), 0.6), false);
});

test('isValidCandidate rejects zero quality', () => {
  assert.equal(isValidCandidate(makeCandidate({ quality: 0 }), 0.6), false);
});

test('markProcessed writes path to processed.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-mp-'));
  try {
    const processedPath = join(dir, 'processed.json');
    const transcriptPath = join(dir, 'session.jsonl');
    await writeFile(processedPath, '[]', 'utf8');
    const { default: fs } = await import('node:fs/promises');
    let paths: string[] = JSON.parse(await fs.readFile(processedPath, 'utf8'));
    if (!paths.includes(transcriptPath)) {
      paths.push(transcriptPath);
      await fs.writeFile(processedPath, JSON.stringify(paths, null, 2), 'utf8');
    }
    const after = JSON.parse(await readFile(processedPath, 'utf8')) as string[];
    assert.ok(after.includes(transcriptPath));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('markProcessed does not duplicate entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-mp2-'));
  try {
    const processedPath = join(dir, 'processed.json');
    const transcriptPath = '/some/session.jsonl';
    await writeFile(processedPath, JSON.stringify([transcriptPath]), 'utf8');
    const { default: fs } = await import('node:fs/promises');
    let paths: string[] = JSON.parse(await fs.readFile(processedPath, 'utf8'));
    if (!paths.includes(transcriptPath)) {
      paths.push(transcriptPath);
      await fs.writeFile(processedPath, JSON.stringify(paths, null, 2), 'utf8');
    }
    const after = JSON.parse(await readFile(processedPath, 'utf8')) as string[];
    assert.equal(after.filter(p => p === transcriptPath).length, 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});
