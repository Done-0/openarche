import { readFile } from 'node:fs/promises';
import type { AppConfig } from './types.js';

export const DEFAULT_CONFIG: AppConfig = {
  embedding: {
    provider: 'local',
    localModel: 'Xenova/multilingual-e5-small',
    remoteProvider: '',
    remoteModel: '',
    remoteApiKey: '',
  },
  retrieval: {
    threshold: 0.73,
    topK: 3,
    maxInjectChars: 3000,
  },
  extraction: {
    model: 'claude-haiku-4-5-20251001',
    minQualityScore: 0.6,
    bootstrapConcurrency: 3,
  },
};

export async function loadConfig(configPath: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const partial = JSON.parse(raw) as Partial<AppConfig>;
    return {
      embedding: { ...DEFAULT_CONFIG.embedding, ...partial.embedding },
      retrieval: { ...DEFAULT_CONFIG.retrieval, ...partial.retrieval },
      extraction: { ...DEFAULT_CONFIG.extraction, ...partial.extraction },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}
