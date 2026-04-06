import { readFile } from 'node:fs/promises';
import type { ProductConfig } from './types.js';

export const DEFAULT_CONFIG: ProductConfig = {
  orchestration: {
    autoInject: true,
    persistAfterFirstToolUse: 'write_only',
    readOnlyCommands: ['/openarche:setup', '/openarche:config', '/openarche:knowledge-search'],
    explicitSessionCommands: ['/openarche:plan', '/openarche:run', '/openarche:validate', '/openarche:observe', '/openarche:review', '/openarche:maintain'],
    injectOnlyIntentThreshold: 0.6,
    materializeIntentThreshold: 0.8,
  },
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
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        ...(parsed.orchestration && typeof parsed.orchestration === 'object' ? parsed.orchestration as Record<string, unknown> : {}),
      },
      knowledge: {
        ...DEFAULT_CONFIG.knowledge,
        ...(parsed.knowledge && typeof parsed.knowledge === 'object' ? parsed.knowledge as Record<string, unknown> : {}),
        embedding: (() => {
          const embedding = parsed.knowledge && typeof parsed.knowledge === 'object' && (parsed.knowledge as Record<string, unknown>).embedding && typeof (parsed.knowledge as Record<string, unknown>).embedding === 'object'
            ? (parsed.knowledge as Record<string, unknown>).embedding as Record<string, unknown>
            : null;
          if (embedding?.provider === 'remote') {
            return {
              provider: 'remote' as const,
              remoteModel: typeof embedding.remoteModel === 'string' ? embedding.remoteModel : '',
              remoteApiKey: typeof embedding.remoteApiKey === 'string' ? embedding.remoteApiKey : '',
              remoteBaseUrl: typeof embedding.remoteBaseUrl === 'string' ? embedding.remoteBaseUrl : '',
            };
          }
          return {
            provider: 'local' as const,
            localModel: embedding && typeof embedding.localModel === 'string'
              ? embedding.localModel
              : DEFAULT_CONFIG.knowledge.embedding.provider === 'local'
                ? DEFAULT_CONFIG.knowledge.embedding.localModel
                : 'Xenova/multilingual-e5-small',
          };
        })(),
        retrieval: {
          ...DEFAULT_CONFIG.knowledge.retrieval,
          ...(parsed.knowledge && typeof parsed.knowledge === 'object' && (parsed.knowledge as Record<string, unknown>).retrieval && typeof (parsed.knowledge as Record<string, unknown>).retrieval === 'object'
            ? (parsed.knowledge as Record<string, unknown>).retrieval as Record<string, unknown>
            : {}),
        },
        extraction: {
          ...DEFAULT_CONFIG.knowledge.extraction,
          ...(parsed.knowledge && typeof parsed.knowledge === 'object' && (parsed.knowledge as Record<string, unknown>).extraction && typeof (parsed.knowledge as Record<string, unknown>).extraction === 'object'
            ? (parsed.knowledge as Record<string, unknown>).extraction as Record<string, unknown>
            : {}),
        },
      },
      execution: {
        ...DEFAULT_CONFIG.execution,
        ...(parsed.execution && typeof parsed.execution === 'object' ? parsed.execution as Record<string, unknown> : {}),
      },
      validation: {
        ...DEFAULT_CONFIG.validation,
        ...(parsed.validation && typeof parsed.validation === 'object' ? parsed.validation as Record<string, unknown> : {}),
        browser: {
          ...DEFAULT_CONFIG.validation.browser,
          ...(parsed.validation && typeof parsed.validation === 'object' && (parsed.validation as Record<string, unknown>).browser && typeof (parsed.validation as Record<string, unknown>).browser === 'object'
            ? (parsed.validation as Record<string, unknown>).browser as Record<string, unknown>
            : {}),
        },
      },
      observability: {
        ...DEFAULT_CONFIG.observability,
        ...(parsed.observability && typeof parsed.observability === 'object' ? parsed.observability as Record<string, unknown> : {}),
      },
      review: {
        ...DEFAULT_CONFIG.review,
        ...(parsed.review && typeof parsed.review === 'object' ? parsed.review as Record<string, unknown> : {}),
      },
      maintenance: {
        ...DEFAULT_CONFIG.maintenance,
        ...(parsed.maintenance && typeof parsed.maintenance === 'object' ? parsed.maintenance as Record<string, unknown> : {}),
      },
    } satisfies ProductConfig;
    if (
      !config.orchestration
      || typeof config.orchestration.autoInject !== 'boolean'
      || (
        config.orchestration.persistAfterFirstToolUse !== 'false'
        && config.orchestration.persistAfterFirstToolUse !== 'write_only'
        && config.orchestration.persistAfterFirstToolUse !== 'execute_or_write'
      )
      || !Array.isArray(config.orchestration.readOnlyCommands)
      || !config.orchestration.readOnlyCommands.every(item => typeof item === 'string')
      || !Array.isArray(config.orchestration.explicitSessionCommands)
      || !config.orchestration.explicitSessionCommands.every(item => typeof item === 'string')
      || typeof config.orchestration.injectOnlyIntentThreshold !== 'number'
      || typeof config.orchestration.materializeIntentThreshold !== 'number'
      || config.orchestration.injectOnlyIntentThreshold <= 0
      || config.orchestration.injectOnlyIntentThreshold >= 1
      || config.orchestration.materializeIntentThreshold <= 0
      || config.orchestration.materializeIntentThreshold >= 1
      || config.orchestration.materializeIntentThreshold < config.orchestration.injectOnlyIntentThreshold
      || !config.knowledge?.embedding
      || (
        config.knowledge.embedding.provider === 'local'
          ? typeof config.knowledge.embedding.localModel !== 'string'
            || !config.knowledge.embedding.localModel.trim()
          : config.knowledge.embedding.provider === 'remote'
            ? typeof config.knowledge.embedding.remoteModel !== 'string'
              || !config.knowledge.embedding.remoteModel.trim()
              || typeof config.knowledge.embedding.remoteApiKey !== 'string'
              || !config.knowledge.embedding.remoteApiKey.trim()
              || typeof config.knowledge.embedding.remoteBaseUrl !== 'string'
              || !config.knowledge.embedding.remoteBaseUrl.trim()
            : true
      )
      || !config.knowledge?.retrieval
      || typeof config.knowledge.retrieval.threshold !== 'number'
      || config.knowledge.retrieval.threshold <= 0
      || config.knowledge.retrieval.threshold > 1
      || typeof config.knowledge.retrieval.topK !== 'number'
      || !Number.isInteger(config.knowledge.retrieval.topK)
      || config.knowledge.retrieval.topK < 1
      || typeof config.knowledge.retrieval.maxInjectChars !== 'number'
      || !Number.isInteger(config.knowledge.retrieval.maxInjectChars)
      || config.knowledge.retrieval.maxInjectChars < 256
      || !config.knowledge?.extraction
      || typeof config.knowledge.extraction.model !== 'string'
      || !config.knowledge.extraction.model.trim()
      || typeof config.knowledge.extraction.minQualityScore !== 'number'
      || config.knowledge.extraction.minQualityScore < 0
      || config.knowledge.extraction.minQualityScore > 1
      || typeof config.knowledge.extraction.captureConcurrency !== 'number'
      || !Number.isInteger(config.knowledge.extraction.captureConcurrency)
      || config.knowledge.extraction.captureConcurrency < 1
      || typeof config.execution?.isolationStrategy !== 'string'
      || typeof config.execution?.baseRef !== 'string'
      || !config.execution.baseRef.trim()
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
      || !Number.isInteger(config.review.repairLoops)
      || config.review.repairLoops < 1
      || (!config.review.localSelfReview && !config.review.localAgentReview && !config.review.cloudAgentReview)
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
