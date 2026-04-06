import { readFile } from 'node:fs/promises';
import type { ProductConfig } from './types.js';

export const DEFAULT_CONFIG: ProductConfig = {
  knowledge: {
    embedding: {
      provider: 'local',
      localModel: 'Xenova/multilingual-e5-small',
    },
    retrieval: {
      threshold: 0.73,
      topK: 3,
      maxInjectChars: 4000,
    },
    extraction: {
      model: 'claude-haiku-4-5-20251001',
      minQualityScore: 0.6,
      captureConcurrency: 3,
    },
  },
  execution: {
    isolationStrategy: 'git-worktree',
    baseRef: 'main',
  },
  validation: {
    browser: {
      enabled: true,
      captureDomSnapshot: true,
      captureScreenshot: true,
      captureNavigation: true,
    },
  },
  observability: {
    enabled: true,
    logs: true,
    metrics: true,
    traces: true,
  },
  review: {
    localSelfReview: true,
    localAgentReview: true,
    cloudAgentReview: true,
    repairLoops: 3,
  },
  maintenance: {
    qualitySweep: true,
    driftSweep: true,
  },
};

export async function loadConfig(configPath: string): Promise<ProductConfig> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const config = JSON.parse(raw) as ProductConfig;
    if (
      !config.knowledge?.embedding
      || (
        config.knowledge.embedding.provider === 'local'
          ? typeof config.knowledge.embedding.localModel !== 'string'
          : config.knowledge.embedding.provider === 'remote'
            ? typeof config.knowledge.embedding.remoteModel !== 'string'
              || typeof config.knowledge.embedding.remoteApiKey !== 'string'
              || typeof config.knowledge.embedding.remoteBaseUrl !== 'string'
            : true
      )
      || !config.knowledge?.retrieval
      || typeof config.knowledge.retrieval.threshold !== 'number'
      || typeof config.knowledge.retrieval.topK !== 'number'
      || typeof config.knowledge.retrieval.maxInjectChars !== 'number'
      || !config.knowledge?.extraction
      || typeof config.knowledge.extraction.model !== 'string'
      || typeof config.knowledge.extraction.minQualityScore !== 'number'
      || typeof config.knowledge.extraction.captureConcurrency !== 'number'
      || typeof config.execution?.isolationStrategy !== 'string'
      || typeof config.execution?.baseRef !== 'string'
      || typeof config.validation?.browser?.enabled !== 'boolean'
      || typeof config.validation.browser.captureDomSnapshot !== 'boolean'
      || typeof config.validation.browser.captureScreenshot !== 'boolean'
      || typeof config.validation.browser.captureNavigation !== 'boolean'
      || typeof config.observability?.enabled !== 'boolean'
      || typeof config.observability.logs !== 'boolean'
      || typeof config.observability.metrics !== 'boolean'
      || typeof config.observability.traces !== 'boolean'
      || typeof config.review?.localSelfReview !== 'boolean'
      || typeof config.review.localAgentReview !== 'boolean'
      || typeof config.review.cloudAgentReview !== 'boolean'
      || typeof config.review.repairLoops !== 'number'
      || typeof config.maintenance?.qualitySweep !== 'boolean'
      || typeof config.maintenance.driftSweep !== 'boolean'
    ) {
      throw new Error('Invalid config shape');
    }
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return structuredClone(DEFAULT_CONFIG);
    }
    throw error;
  }
}
