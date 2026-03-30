import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStatusLine } from '../../src/hooks/status-line.js';
import type { AppState } from '../../src/types.js';

function makeState(overrides: Partial<AppState> = {}): AppState {
  return { totalMemories: 0, lastMatch: null, bootstrapping: { current: 0, total: 0 }, ...overrides };
}

test('renderStatusLine shows no memories when totalMemories is 0', () => {
  assert.equal(renderStatusLine(makeState()), '○ Arche  no memories yet');
});

test('renderStatusLine shows memory count when no recent match', () => {
  assert.equal(renderStatusLine(makeState({ totalMemories: 5 })), '◉ Arche  5 memories');
});

test('renderStatusLine shows last match when within 10 minutes', () => {
  const result = renderStatusLine(makeState({
    totalMemories: 10,
    lastMatch: { count: 3, at: Date.now() - 2 * 60 * 1000 },
  }));
  assert.ok(result.includes('3 matched'));
  assert.ok(result.includes('2m ago'));
});

test('renderStatusLine shows <1m ago for very recent match', () => {
  const result = renderStatusLine(makeState({
    totalMemories: 5,
    lastMatch: { count: 1, at: Date.now() - 10 * 1000 },
  }));
  assert.ok(result.includes('<1m ago'));
});

test('renderStatusLine omits last match when older than 10 minutes', () => {
  assert.equal(
    renderStatusLine(makeState({ totalMemories: 10, lastMatch: { count: 3, at: Date.now() - 11 * 60 * 1000 } })),
    '◉ Arche  10 memories'
  );
});

test('renderStatusLine shows bootstrap progress', () => {
  assert.equal(
    renderStatusLine(makeState({ bootstrapping: { current: 12, total: 47 } })),
    '◉ Arche  extracting 12/47...'
  );
});

test('renderStatusLine bootstrap takes priority over memory count', () => {
  const result = renderStatusLine(makeState({
    totalMemories: 10,
    bootstrapping: { current: 3, total: 20 },
  }));
  assert.ok(result.includes('extracting 3/20'));
  assert.ok(!result.includes('10 memories'));
});

test('renderStatusLine bootstrap total 0 means not bootstrapping', () => {
  assert.equal(
    renderStatusLine(makeState({ totalMemories: 5, bootstrapping: { current: 0, total: 0 } })),
    '◉ Arche  5 memories'
  );
});

test('renderStatusLine exactly at 10 minute boundary omits last match', () => {
  const result = renderStatusLine(makeState({
    totalMemories: 5,
    lastMatch: { count: 2, at: Date.now() - 10 * 60 * 1000 - 1 },
  }));
  assert.equal(result, '◉ Arche  5 memories');
});
