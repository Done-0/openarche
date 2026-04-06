import { loadConfig } from '../config.js';
import { createHarnessSession, evaluateHarnessCompletion, loadHarnessSession, synchronizeHarnessSession, writeHarnessSession } from './session.js';
import { createProductManifest } from '../product/manifest.js';
import { writeHarnessBundle } from './artifact-writer.js';
import { evaluateHarnessGateWithEmbeddings } from './gates.js';
import { createHarnessBundle } from './harness-system.js';
import type { HarnessCompletion, HarnessComplexity } from '../contracts.js';

export interface AutoHarnessFlowResult {
  writtenPaths: string[];
  required: boolean;
  complexity: HarnessComplexity;
  sessionId: string | null;
  completion: HarnessCompletion | null;
  warnings: string[];
}

export async function ensureAutoHarnessFlow(baseDir: string, promptText: string, repoRoot?: string): Promise<AutoHarnessFlowResult | null> {
  if (!repoRoot) return null;

  const config = await loadConfig(`${baseDir}/config.json`);
  const gate = await evaluateHarnessGateWithEmbeddings(promptText, config);
  if (!gate.required) {
    return {
      writtenPaths: [],
      required: false,
      complexity: gate.complexity,
      sessionId: null,
      completion: null,
      warnings: [],
    };
  }

  const routeMatches = Array.from(new Set(promptText.match(/\/[A-Za-z0-9/_-]+/g) ?? []));
  const lowerPrompt = promptText.toLowerCase();
  const browserSignals = ['ui', 'page', 'screen', 'browser', 'dom', 'click', 'form', 'button', 'modal', 'navigation', 'checkout', 'signup', 'login', 'onboarding'];
  const observabilitySignals = ['latency', 'performance', 'reliability', 'timeout', 'slow', 'error', 'trace', 'metric', 'metrics', 'log', 'logs', 'throughput', 'availability'];
  const journeys = routeMatches.length > 0 || browserSignals.some(signal => lowerPrompt.includes(signal))
    ? [{
        name: promptText.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Primary journey',
        route: routeMatches.length > 0 ? routeMatches : ['/'],
        successSignal: promptText.replace(/\s+/g, ' ').trim().slice(0, 160) || 'The user-visible flow succeeds.',
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
    objective: promptText,
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
    };
  } catch (error) {
    return {
      writtenPaths: [],
      required: true,
      complexity: gate.complexity,
      sessionId: bundle.runbook.plan.id,
      completion: null,
      warnings: [...preflightWarnings, `Failed to materialize harness artifacts: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
