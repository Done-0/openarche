import { cosineSimilarity, embed } from '../knowledge/embedding.js';
import type { HarnessComplexity, HarnessGate } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export type HarnessIntent = 'question' | 'configure' | 'analysis' | 'execute';
export type HarnessPersistenceMode = 'skip' | 'inject_only' | 'materialize';

export interface HarnessPolicyDecision {
  command: string | null;
  intent: HarnessIntent;
  inject: boolean;
  materialize: boolean;
  mode: HarnessPersistenceMode;
  reasons: string[];
}

let prototypeCacheKey = '';
let prototypeCache: Record<HarnessIntent, number[][]> | null = null;

export async function evaluateHarnessPolicy(
  promptText: string,
  config: ProductConfig,
  gate: HarnessGate
): Promise<HarnessPolicyDecision> {
  const normalizedPrompt = promptText.replace(/\s+/g, ' ').trim();
  const denseLength = normalizedPrompt.replace(/\s+/g, '').length;
  const punctuationCount = Array.from(normalizedPrompt.matchAll(/[^\p{L}\p{N}\s]/gu)).length;
  const lineCount = promptText.split('\n').map(line => line.trim()).filter(Boolean).length;
  const command = normalizedPrompt.match(/^\/[A-Za-z0-9:_-]+/)?.[0] ?? null;
  if (!config.orchestration.autoInject) {
    return {
      command,
      intent: 'question',
      inject: false,
      materialize: false,
      mode: 'skip',
      reasons: ['Automatic harness injection is disabled by configuration.'],
    };
  }
  if (command && config.orchestration.readOnlyCommands.includes(command)) {
    return {
      command,
      intent: 'configure',
      inject: true,
      materialize: false,
      mode: 'inject_only',
      reasons: [`${command} is configured as a read-only command, so no project session is materialized.`],
    };
  }
  if (command && config.orchestration.explicitSessionCommands.includes(command)) {
    return {
      command,
      intent: 'execute',
      inject: true,
      materialize: true,
      mode: 'materialize',
      reasons: [`${command} is configured as an explicit harness-session command.`],
    };
  }
  if (!gate.required) {
    return {
      command,
      intent: 'question',
      inject: true,
      materialize: false,
      mode: 'inject_only',
      reasons: ['The prompt stayed below the harness threshold, so only lightweight context is injected.'],
    };
  }

  try {
    const cacheKey = config.knowledge.embedding.provider === 'local'
      ? `local:${config.knowledge.embedding.localModel}`
      : `remote:${config.knowledge.embedding.remoteBaseUrl}:${config.knowledge.embedding.remoteModel}`;
    if (!prototypeCache || prototypeCacheKey !== cacheKey) {
      prototypeCacheKey = cacheKey;
      prototypeCache = {
        question: await Promise.all([
          embed('explain what this tool does and how it works', config),
          embed('answer a question about the current system behavior without changing files', config),
          embed('describe the purpose of generated files and status indicators', config),
        ]),
        configure: await Promise.all([
          embed('inspect or change configuration values and explain the result', config),
          embed('set up the tool or update runtime configuration without creating a task session', config),
          embed('check environment settings and report what changed', config),
        ]),
        analysis: await Promise.all([
          embed('inspect the current code and reason about whether the logic is correct before making changes', config),
          embed('analyze architecture tradeoffs and explain what should change without editing files yet', config),
          embed('review the current implementation and identify gaps before execution starts', config),
        ]),
        execute: await Promise.all([
          embed('implement a change, verify it, review it, and finish the task end to end', config),
          embed('refactor or fix code with explicit validation and follow-up work', config),
          embed('perform a production engineering task that should open a harness session', config),
        ]),
      };
    }
    const promptEmbedding = await embed(normalizedPrompt, config);
    const scores = {
      question: prototypeCache.question.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
      configure: prototypeCache.configure.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
      analysis: prototypeCache.analysis.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
      execute: prototypeCache.execute.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1),
    };
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[HarnessIntent, number]>;
    const [intent, score] = ranked[0];
    const structuralExecutionSignal =
      denseLength >= 160
      || punctuationCount >= 3
      || lineCount >= 4
      || gate.complexity === 'high';
    if (intent === 'execute' && (score >= config.orchestration.materializeIntentThreshold || structuralExecutionSignal)) {
      return {
        command,
        intent,
        inject: true,
        materialize: true,
        mode: 'materialize',
        reasons: [...gate.reasons, `Prompt intent aligns with execution examples (score ${score.toFixed(2)}).`],
      };
    }
    return {
      command,
      intent,
      inject: true,
      materialize: false,
      mode: 'inject_only',
      reasons: intent === 'configure' || intent === 'analysis' || score >= config.orchestration.injectOnlyIntentThreshold
        ? [...gate.reasons, `Prompt intent aligns with ${intent} examples (score ${score.toFixed(2)}), so context is injected without materializing a task session.`]
        : [...gate.reasons, `Prompt intent is still ambiguous (score ${score.toFixed(2)}), so OpenArche stays in inject-only mode until execution begins.`],
    };
  } catch {
    return {
      command,
      intent: 'analysis',
      inject: true,
      materialize: false,
      mode: 'inject_only',
      reasons: [...gate.reasons, 'Intent scoring was unavailable, so OpenArche falls back to inject-only mode until explicit execution begins.'],
    };
  }
}
