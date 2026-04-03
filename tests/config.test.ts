import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';

test('loadConfig returns DEFAULT_CONFIG when file missing', async () => {
  const config = await loadConfig('/nonexistent/config.json');
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test('loadConfig merges partial embedding config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-cfg-'));
  try {
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({ embedding: { provider: 'remote' } }), 'utf8');
    const config = await loadConfig(configPath);
    assert.equal(config.embedding.provider, 'remote');
    assert.equal(config.embedding.localModel, DEFAULT_CONFIG.embedding.localModel);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('loadConfig merges partial retrieval config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-cfg2-'));
  try {
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({ retrieval: { topK: 10 } }), 'utf8');
    const config = await loadConfig(configPath);
    assert.equal(config.retrieval.topK, 10);
    assert.equal(config.retrieval.threshold, DEFAULT_CONFIG.retrieval.threshold);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('loadConfig merges partial extraction config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oe-cfg3-'));
  try {
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({ extraction: { minQualityScore: 0.8 } }), 'utf8');
    const config = await loadConfig(configPath);
    assert.equal(config.extraction.minQualityScore, 0.8);
    assert.equal(config.extraction.model, DEFAULT_CONFIG.extraction.model);
  } finally {
    await rm(dir, { recursive: true });
  }
});
