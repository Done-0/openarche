import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVector, cosineSimilarity } from '../../src/engine/embedder.js';

test('normalizeVector produces unit vector', () => {
  const result = normalizeVector([3, 4]);
  const mag = Math.sqrt(result.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(mag - 1.0) < 1e-9);
});

test('normalizeVector handles zero vector', () => {
  assert.deepEqual(normalizeVector([0, 0, 0]), [0, 0, 0]);
});

test('cosineSimilarity returns 1.0 for identical vectors', () => {
  const v = [1, 2, 3];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-9);
});

test('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});

test('cosineSimilarity returns -1.0 for opposite vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) - (-1.0)) < 1e-9);
});
