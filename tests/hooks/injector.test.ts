import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInjectXml } from '../../src/hooks/injector.js';
import type { SearchResult } from '../../src/engine/search.js';
import type { ArcheEntry } from '../../src/types.js';

function makeResult(id: string, via: 'vector' | 'link', overrides: Partial<ArcheEntry> = {}): SearchResult {
  const entry: ArcheEntry = {
    id, title: 'Test memory', type: 'solution', structure: 'atomic',
    tags: [], links: [], score: 1.2, access_count: 2,
    source_project: 'my-app', trigger_context: 'when testing',
    quality: 0.9, created_at: Date.now() - 3 * 86400000, last_accessed: null,
    embedding: [],
    ...overrides,
  };
  return { entry, similarity: 0.85, via };
}

test('formatInjectXml produces valid arche_context XML', () => {
  const results = [makeResult('abc1', 'vector'), makeResult('def2', 'link')];
  const xml = formatInjectXml(results, 23, id => `body of ${id}`);
  assert.ok(xml.startsWith('<arche_context matched="2" total="23">'));
  assert.ok(xml.includes('id="abc1"'));
  assert.ok(xml.includes('via="vector"'));
  assert.ok(xml.includes('id="def2"'));
  assert.ok(xml.includes('via="link"'));
  assert.ok(xml.includes('body of abc1'));
  assert.ok(xml.endsWith('</arche_context>'));
});

test('formatInjectXml includes score, age, project attributes', () => {
  const results = [makeResult('abc1', 'vector')];
  const xml = formatInjectXml(results, 1, () => 'body');
  assert.ok(xml.includes('score="1.2"'));
  assert.ok(xml.includes('project="my-app"'));
  assert.ok(xml.includes('age="3d"'));
});

test('formatInjectXml uses general for null source_project', () => {
  const results = [makeResult('abc1', 'vector', { source_project: null })];
  const xml = formatInjectXml(results, 1, () => 'body');
  assert.ok(xml.includes('project="general"'));
});

test('formatInjectXml handles empty results', () => {
  const xml = formatInjectXml([], 10, () => '');
  assert.ok(xml.includes('matched="0"'));
  assert.ok(xml.includes('total="10"'));
  assert.ok(xml.includes('<arche_context'));
  assert.ok(xml.includes('</arche_context>'));
});

test('formatInjectXml includes type and structure attributes', () => {
  const results = [makeResult('abc1', 'vector', { type: 'gotcha', structure: 'linear' })];
  const xml = formatInjectXml(results, 1, () => 'body');
  assert.ok(xml.includes('type="gotcha"'));
  assert.ok(xml.includes('structure="linear"'));
});

test('formatInjectXml age is 0d for today', () => {
  const results = [makeResult('abc1', 'vector', { created_at: Date.now() })];
  const xml = formatInjectXml(results, 1, () => 'body');
  assert.ok(xml.includes('age="0d"'));
});

test('formatInjectXml score is formatted to 1 decimal', () => {
  const results = [makeResult('abc1', 'vector', { score: 1.0 })];
  const xml = formatInjectXml(results, 1, () => 'body');
  assert.ok(xml.includes('score="1.0"'));
});

test('formatInjectXml body is included verbatim', () => {
  const body = 'Use `createRequire` for CJS in ESM:\n```js\nconst r = createRequire(import.meta.url)\n```';
  const results = [makeResult('abc1', 'vector')];
  const xml = formatInjectXml(results, 1, () => body);
  assert.ok(xml.includes(body));
});

test('formatInjectXml total can be zero', () => {
  const xml = formatInjectXml([], 0, () => '');
  assert.ok(xml.includes('total="0"'));
});
