import { loadConfig } from '../config.js';
import { createHarnessSession, evaluateHarnessCompletion, loadHarnessSession, synchronizeHarnessSession, writeHarnessSession } from './session.js';
import { createProductManifest } from '../product/manifest.js';
import { writeHarnessBundle } from './artifact-writer.js';
import { evaluateHarnessGateWithEmbeddings } from './gates.js';
import { createHarnessBundle } from './harness-system.js';
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
  if (!gate.required) {
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
  const lowerPrompt = promptText.toLowerCase();
  const persistedObjective = promptText
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+\b/gi, 'Bearer [redacted-secret]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'Requested engineering change';
  const browserSignals = ['ui', 'page', 'screen', 'browser', 'dom', 'click', 'form', 'button', 'modal', 'navigation', 'checkout', 'signup', 'login', 'onboarding'];
  const observabilitySignals = ['latency', 'performance', 'reliability', 'timeout', 'slow', 'error', 'trace', 'metric', 'metrics', 'log', 'logs', 'throughput', 'availability'];
  const journeys = routeMatches.length > 0 || browserSignals.some(signal => lowerPrompt.includes(signal))
    ? [{
        name: persistedObjective.slice(0, 80) || 'Primary journey',
        route: routeMatches.length > 0 ? routeMatches : ['/'],
        successSignal: persistedObjective.slice(0, 160) || 'The user-visible flow succeeds.',
      }]
    : [];
  const services = gate.requiredStages.includes('observe') || observabilitySignals.some(signal => lowerPrompt.includes(signal))
    ? Array.from(new Set(
        routeMatches
          .map(route => route.split('/').filter(Boolean)[0] ?? '')
          .filter(Boolean)
      ))
    : [];

  const bundle = createHarnessBundle({
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
    services: services.length > 0 ? services : (gate.requiredStages.includes('observe') ? ['application'] : []),
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
    const session = createHarnessSession(bundle, repoRoot, [], existingSession);
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
    return {
      writtenPaths: session.artifactPaths,
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
    const writtenPaths = await writeHarnessBundle(repoRoot, bundle);
    const session = await synchronizeHarnessSession(repoRoot, bundle.runbook.plan.id) ?? await loadHarnessSession(repoRoot, bundle.runbook.plan.id);
    return {
      writtenPaths,
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: session ? evaluateHarnessCompletion(session) : null,
      warnings: preflightWarnings,
      mode: 'materialize',
      decisionReasons: policy.reasons,
    };
  } catch (error) {
    return {
      writtenPaths: [],
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: null,
      warnings: [...preflightWarnings, `Failed to materialize harness artifacts: ${error instanceof Error ? error.message : String(error)}`],
      mode: 'materialize',
      decisionReasons: policy.reasons,
    };
  }
}
