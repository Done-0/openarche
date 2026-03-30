import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadState, saveState } from '../src/state.js';

test('loadState returns default state when file missing', async () => {
  const state = await loadState('/nonexistent/state.json');
  assert.equal(state.totalMemories, 0);
  assert.equal(state.lastMatch, null);
  assert.deepEqual(state.bootstrapping, { current: 0, total: 0 });
});

test('saveState and loadState round-trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-st-'));
  try {
    const statePath = join(dir, 'state.json');
    await saveState(statePath, {
      totalMemories: 42,
      lastMatch: { count: 3, at: 1234567890 },
      bootstrapping: { current: 5, total: 20 },
    });
    const loaded = await loadState(statePath);
    assert.equal(loaded.totalMemories, 42);
    assert.deepEqual(loaded.lastMatch, { count: 3, at: 1234567890 });
    assert.deepEqual(loaded.bootstrapping, { current: 5, total: 20 });
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('loadState merges missing fields with defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-st2-'));
  try {
    const statePath = join(dir, 'state.json');
    await saveState(statePath, { totalMemories: 7, lastMatch: null, bootstrapping: { current: 0, total: 0 } });
    const loaded = await loadState(statePath);
    assert.equal(loaded.totalMemories, 7);
    assert.equal(loaded.lastMatch, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});
