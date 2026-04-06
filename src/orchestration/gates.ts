import { cosineSimilarity, embed } from '../knowledge/embedding.js';
import type { ProductConfig } from '../types.js';
import type { HarnessComplexity, HarnessGate, HarnessStageName } from '../contracts.js';

const COMPLEX_KEYWORDS = [
  'refactor',
  'architecture',
  'migration',
  'reliability',
  'performance',
  'latency',
  'validation',
  'review',
  'observability',
  'worktree',
  'bug',
  'regression',
  'flow',
];

export function evaluateHarnessGate(promptText: string): HarnessGate {
  const text = promptText.trim().toLowerCase();
  const reasons: string[] = [];
  const hanCount = Array.from(text).filter(char => /\p{Script=Han}/u.test(char)).length;

  if (text.length >= 120) reasons.push('Prompt is long enough to indicate multi-step work.');
  if (text.includes(' and ')) reasons.push('Prompt contains multiple linked actions.');
  if ((text.match(/[,:;.!?]/g) ?? []).length >= 2 || (text.match(/[，、；。！？]/g) ?? []).length >= 2) reasons.push('Prompt contains chained actions or constraints.');
  if (text.includes('harness') || text.includes('production') || text.includes('systematic') || text.includes('automation') || text.includes('end-to-end')) reasons.push('Prompt demands production-level engineering controls.');
  if (hanCount >= 12) reasons.push('Prompt contains enough dense non-whitespace text to indicate multi-part work.');
  const keywordHits = COMPLEX_KEYWORDS.filter(keyword => text.includes(keyword)).length;
  if (keywordHits > 0) reasons.push('Prompt contains engineering-complexity keywords.');
  if (keywordHits >= 3) reasons.push('Prompt spans multiple engineering control surfaces.');
  if (hanCount >= 24 && reasons.length >= 2) reasons.push('Prompt is dense enough to justify full harness controls.');

  let complexity: HarnessComplexity = 'light';
  if (reasons.length >= 3) complexity = 'high';
  else if (reasons.length >= 1) complexity = 'moderate';

  const requiredStages: HarnessStageName[] =
    complexity === 'light'
      ? ['plan', 'execute']
      : complexity === 'moderate'
        ? ['plan', 'execute', 'validate', 'review']
        : ['plan', 'execute', 'validate', 'observe', 'review', 'maintain'];

  return {
    required: complexity !== 'light',
    complexity,
    reasons,
    requiredStages,
  };
}

let prototypeCacheKey = '';
let prototypeCache: Record<HarnessComplexity, number[][]> | null = null;

export async function evaluateHarnessGateWithEmbeddings(promptText: string, config: ProductConfig): Promise<HarnessGate> {
  const gate = evaluateHarnessGate(promptText);
  if (
    gate.complexity === 'high'
    || gate.complexity === 'light' && gate.reasons.length === 0
  ) {
    return gate;
  }
  try {
    const cacheKey = config.knowledge.embedding.provider === 'local'
      ? `local:${config.knowledge.embedding.localModel}`
      : `remote:${config.knowledge.embedding.remoteBaseUrl}:${config.knowledge.embedding.remoteModel}`;
    if (!prototypeCache || prototypeCacheKey !== cacheKey) {
      prototypeCacheKey = cacheKey;
      prototypeCache = {
        light: await Promise.all([
          embed('rename a variable', config),
          embed('fix a typo in one file', config),
          embed('update one string literal', config),
        ]),
        moderate: await Promise.all([
          embed('implement a feature with validation and review', config),
          embed('refactor a module and verify behavior', config),
          embed('change application logic and confirm acceptance criteria', config),
        ]),
        high: await Promise.all([
          embed('perform a production-grade refactor with validation observability review and maintenance', config),
          embed('restructure architecture and close all engineering stages end to end', config),
          embed('deliver a system-wide change with harness controls and durable follow-up', config),
        ]),
      };
    }
    const promptEmbedding = await embed(promptText, config);
    const scores = {
      light: prototypeCache.light.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
      moderate: prototypeCache.moderate.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
      high: prototypeCache.high.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
    };
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[HarnessComplexity, number]>;
    if (ranked[0][0] === gate.complexity || ranked[0][1] < 0.55) {
      return gate;
    }
    const complexity = ranked[0][0];
    return {
      required: complexity !== 'light',
      complexity,
      reasons: [...gate.reasons, `Prompt embedding aligns most strongly with ${complexity} complexity examples.`],
      requiredStages:
        complexity === 'light'
          ? ['plan', 'execute']
          : complexity === 'moderate'
            ? ['plan', 'execute', 'validate', 'review']
            : ['plan', 'execute', 'validate', 'observe', 'review', 'maintain'],
    };
  } catch {
    return gate;
  }
}
