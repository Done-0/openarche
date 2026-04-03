import { readFile } from 'node:fs/promises';
import type { AppConfig } from './types.js';

export const DEFAULT_CONFIG: AppConfig = {
  embedding: {
    provider: 'local',
    localModel: 'Xenova/multilingual-e5-small',
    remoteModel: '',
    remoteApiKey: '',
    remoteBaseUrl: '',
  },
  retrieval: {
    threshold: 0.73,
    topK: 3,
    maxInjectChars: 3000,
    reranking: {
      enabled: false,
      provider: 'local',
      remoteModel: '',
      remoteApiKey: '',
      remoteBaseUrl: '',
      weights: {
        similarity: 0.7,
        quality: 0.2,
        recency: 0.05,
        frequency: 0.05,
      },
    },
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
    const defaultReranking = DEFAULT_CONFIG.retrieval.reranking!;
    return {
      embedding: { ...DEFAULT_CONFIG.embedding, ...partial.embedding },
      retrieval: {
        ...DEFAULT_CONFIG.retrieval,
        ...partial.retrieval,
        reranking: {
          enabled: partial.retrieval?.reranking?.enabled ?? defaultReranking.enabled,
          provider: partial.retrieval?.reranking?.provider ?? defaultReranking.provider,
          remoteModel: partial.retrieval?.reranking?.remoteModel ?? defaultReranking.remoteModel,
          remoteApiKey: partial.retrieval?.reranking?.remoteApiKey ?? defaultReranking.remoteApiKey,
          remoteBaseUrl: partial.retrieval?.reranking?.remoteBaseUrl ?? defaultReranking.remoteBaseUrl,
          weights: { ...defaultReranking.weights, ...partial.retrieval?.reranking?.weights },
        },
      },
      extraction: { ...DEFAULT_CONFIG.extraction, ...partial.extraction },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}
