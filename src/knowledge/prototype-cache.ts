import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProductConfig } from '../types.js';
import { mutateJsonFile, readJsonFile } from '../runtime/json-store.js';

interface PrototypeCacheFile {
  version: 1;
  cacheKey: string;
  sections: Record<string, Record<string, number[][]>>;
  generatedAt: number;
}

function createDefaultPrototypeCache(cacheKey: string): PrototypeCacheFile {
  return {
    version: 1,
    cacheKey,
    sections: {},
    generatedAt: 0,
  };
}

function getCachePath(): string {
  return join(homedir(), '.claude', 'openarche', 'prototype-cache.json');
}

function getCacheKey(config: ProductConfig): string {
  return config.knowledge.embedding.provider === 'local'
    ? `local:${config.knowledge.embedding.localModel}`
    : `remote:${config.knowledge.embedding.remoteBaseUrl}:${config.knowledge.embedding.remoteModel}`;
}

export async function loadPrototypeSection(
  config: ProductConfig,
  section: string,
  build: () => Promise<Record<string, number[][]>>
): Promise<Record<string, number[][]>> {
  const cacheKey = getCacheKey(config);
  const cachePath = getCachePath();
  const cached = await readJsonFile(cachePath, () => createDefaultPrototypeCache(cacheKey));
  if (cached.version === 1 && cached.cacheKey === cacheKey && cached.sections[section]) {
    return cached.sections[section];
  }
  const built = await build();
  await mutateJsonFile(cachePath, () => createDefaultPrototypeCache(cacheKey), file => {
    if (file.version !== 1 || file.cacheKey !== cacheKey) {
      file.version = 1;
      file.cacheKey = cacheKey;
      file.sections = {};
    }
    file.sections[section] = built;
    file.generatedAt = Date.now();
  });
  return built;
}
