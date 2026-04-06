import { loadConfig } from '../config.js';
import { cosineSimilarity, embed } from '../knowledge/embedding.js';
import { loadPrototypeSection } from '../knowledge/prototype-cache.js';
import { createHarnessSession, evaluateHarnessCompletion, getHarnessSessionStatePath, loadHarnessSession, synchronizeHarnessSession, writeHarnessSession } from './session.js';
import { createProductManifest } from '../product/manifest.js';
import { evaluateHarnessGateWithEmbeddings } from './gates.js';
import { createHarnessBundle } from './harness-system.js';
import { appendHarnessDecisionLog } from './decision-log.js';
import { evaluateHarnessPolicy } from './policy.js';
import type { HarnessPolicyDecision } from './policy.js';
import type { HarnessCompletion, HarnessComplexity } from '../contracts.js';

export interface AutoHarnessFlowResult {
  writtenPaths: string[];
  required: boolean;
  complexity: HarnessComplexity;
  sessionId: string | null;
  completion: HarnessCompletion | null;
  warnings: string[];
  mode: 'skip' | 'inject_only' | 'materialize';
  decisionReasons: string[];
}

export async function ensureAutoHarnessFlow(
  baseDir: string,
  promptText: string,
  repoRoot?: string,
  options: { materialize?: boolean; decision?: HarnessPolicyDecision } = {}
): Promise<AutoHarnessFlowResult | null> {
  if (!repoRoot) return null;

  const config = await loadConfig(`${baseDir}/config.json`);
  const gate = await evaluateHarnessGateWithEmbeddings(promptText, config);
  const policy = options.decision ?? await evaluateHarnessPolicy(promptText, config, gate);
  const materialize = options.materialize ?? policy.materialize;
  const decisionPrompt = promptText.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!gate.required) {
    await appendHarnessDecisionLog(baseDir, {
      repoRoot,
      prompt: decisionPrompt,
      gate,
      policy,
      decision: policy.mode,
      sessionId: null,
    });
    return {
      writtenPaths: [],
      required: false,
      complexity: gate.complexity,
      sessionId: null,
      completion: null,
      warnings: [],
      mode: policy.mode,
      decisionReasons: policy.reasons,
    };
  }
  if (!materialize) {
    await appendHarnessDecisionLog(baseDir, {
      repoRoot,
      prompt: decisionPrompt,
      gate,
      policy,
      decision: policy.mode,
      sessionId: null,
    });
    return {
      writtenPaths: [],
      required: true,
      complexity: gate.complexity,
      sessionId: null,
      completion: null,
      warnings: [],
      mode: policy.mode,
      decisionReasons: policy.reasons,
    };
  }

  const routeMatches = Array.from(new Set(promptText.match(/\/[A-Za-z0-9/_-]+/g) ?? []));
  const persistedObjective = promptText
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+\b/gi, 'Bearer [redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'Requested engineering change';
  let browserRelevant = routeMatches.length > 0;
  let observabilityRelevant = gate.requiredStages.includes('observe');
  try {
    const signalPrototypeCache = await loadPrototypeSection(config, 'signals', async () => ({
      browser: await Promise.all([
        embed('fix or validate a browser-based user flow with visible interactions', config),
        embed('verify page navigation forms buttons screenshots and front-end behavior', config),
        embed('debug a user journey in the interface and prove it with browser evidence', config),
      ]),
      observability: await Promise.all([
        embed('investigate reliability or performance with logs metrics traces and service signals', config),
        embed('debug a runtime issue using observability evidence from application services', config),
        embed('validate production behavior with logs metrics traces errors and latency checks', config),
      ]),
    }));
    const promptEmbedding = await embed(promptText, config);
    const browserScore = signalPrototypeCache.browser.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1);
    const observabilityScore = signalPrototypeCache.observability.reduce((best, candidate) => Math.max(best, cosineSimilarity(promptEmbedding, candidate)), -1);
    browserRelevant = browserRelevant || browserScore >= 0.62;
    observabilityRelevant = observabilityRelevant || observabilityScore >= 0.62;
  } catch {
    browserRelevant = browserRelevant || gate.complexity === 'high';
    observabilityRelevant = observabilityRelevant || gate.complexity === 'high';
  }
  const journeys = browserRelevant
    ? [{
        name: persistedObjective.slice(0, 80) || 'Primary journey',
        route: routeMatches.length > 0 ? routeMatches : ['/'],
        successSignal: persistedObjective.slice(0, 160) || 'The user-visible flow succeeds.',
      }]
    : [];
  const services = observabilityRelevant
    ? Array.from(new Set(
        routeMatches
          .map(route => route.split('/').filter(Boolean)[0] ?? '')
          .filter(Boolean)
      ))
    : [];

  const bundle = createHarnessBundle({
    gate,
    manifest: createProductManifest('workspace'),
    config,
    objective: persistedObjective,
    acceptanceCriteria: [
      'The requested change is implemented.',
      'Validation evidence exists for the requested change.',
      'Review blockers are resolved or explicitly accepted.',
    ],
    steps: gate.requiredStages.map(stage => ({
      title: `Run ${stage} stage`,
      capability:
        stage === 'execute' ? 'worktree'
        : stage === 'validate' ? 'browser'
        : stage === 'observe' ? 'observability'
        : stage === 'review' ? 'review'
        : stage === 'maintain' ? 'maintenance'
        : 'planning',
      outcome: `${stage} stage requirements are explicit and actionable.`,
    })),
    repoRoot,
    services: services.length > 0 ? services : (observabilityRelevant ? ['application'] : []),
    journeys,
  });
  let existingSession = null;
  const preflightWarnings: string[] = [];
  try {
    existingSession = await loadHarnessSession(repoRoot, bundle.runbook.plan.id);
  } catch (error) {
    preflightWarnings.push(`Failed to inspect harness session state: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (existingSession) {
    const session = createHarnessSession(bundle, repoRoot, existingSession);
    const warnings = [...preflightWarnings];
    try {
      await writeHarnessSession(repoRoot, session);
    } catch (error) {
      warnings.push(`Failed to persist harness session: ${error instanceof Error ? error.message : String(error)}`);
    }
    let synchronized = null;
    try {
      synchronized = await synchronizeHarnessSession(repoRoot, bundle.runbook.plan.id);
    } catch (error) {
      warnings.push(`Failed to synchronize harness session: ${error instanceof Error ? error.message : String(error)}`);
    }
    await appendHarnessDecisionLog(baseDir, {
      repoRoot,
      prompt: decisionPrompt,
      gate,
      policy,
      decision: 'materialize',
      sessionId: bundle.runbook.plan.id,
    });
    return {
      writtenPaths: [getHarnessSessionStatePath(repoRoot, session.id)],
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: evaluateHarnessCompletion(synchronized ?? session),
      warnings,
      mode: 'materialize',
      decisionReasons: policy.reasons,
    };
  }

  try {
    const session = createHarnessSession(bundle, repoRoot);
    await writeHarnessSession(repoRoot, session);
    await appendHarnessDecisionLog(baseDir, {
      repoRoot,
      prompt: decisionPrompt,
      gate,
      policy,
      decision: 'materialize',
      sessionId: bundle.runbook.plan.id,
    });
    const synchronized = await synchronizeHarnessSession(repoRoot, bundle.runbook.plan.id) ?? await loadHarnessSession(repoRoot, bundle.runbook.plan.id);
    return {
      writtenPaths: [getHarnessSessionStatePath(repoRoot, session.id)],
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: synchronized ? evaluateHarnessCompletion(synchronized) : null,
      warnings: preflightWarnings,
      mode: 'materialize',
      decisionReasons: policy.reasons,
    };
  } catch (error) {
    await appendHarnessDecisionLog(baseDir, {
      repoRoot,
      prompt: decisionPrompt,
      gate,
      policy,
      decision: 'materialize',
      sessionId: null,
    });
    return {
      writtenPaths: [],
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: null,
      warnings: [...preflightWarnings, `Failed to materialize harness session: ${error instanceof Error ? error.message : String(error)}`],
      mode: 'materialize',
      decisionReasons: policy.reasons,
    };
  }
}
