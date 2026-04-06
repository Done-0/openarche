import { createExecutionPlan, validateExecutionPlan } from '../planning/plan.js';
import { evaluateHarnessGate } from './gates.js';
import { createRunbook } from './runbook.js';
import type { BrowserJourney, HarnessArtifact, HarnessGate, HarnessStageName, PlanStep, ProductManifest, Runbook } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export interface HarnessBundleRequest {
  manifest: ProductManifest;
  config: ProductConfig;
  objective: string;
  acceptanceCriteria: string[];
  steps: Omit<PlanStep, 'id'>[];
  repoRoot: string;
  services: string[];
  journeys: BrowserJourney[];
}

export interface HarnessBundle {
  gate: HarnessGate;
  runbook: Runbook;
  artifacts: Array<HarnessArtifact<unknown>>;
  requiredStages: HarnessStageName[];
  automatedStages: HarnessStageName[];
}

export function createHarnessBundle(request: HarnessBundleRequest): HarnessBundle {
  const gate = evaluateHarnessGate(request.objective);
  const plan = createExecutionPlan(request.objective, request.steps, request.acceptanceCriteria);
  const planErrors = validateExecutionPlan(plan);
  if (planErrors.length > 0) {
    throw new Error(`Invalid execution plan: ${planErrors.join(' ')}`);
  }
  const runbook = createRunbook(
    request.manifest,
    request.config,
    plan,
    request.repoRoot,
    request.services,
    request.objective,
    request.journeys
  );

  return {
    gate,
    runbook,
    artifacts: [
      {
        kind: 'plan',
        fileName: `${plan.id}.plan.json`,
        payload: plan,
      },
      {
        kind: 'runbook',
        fileName: `${runbook.plan.id}.runbook.json`,
        payload: runbook,
      },
      {
        kind: 'validation',
        fileName: `${runbook.plan.id}.validation.json`,
        payload: runbook.validation,
      },
      {
        kind: 'review',
        fileName: `${runbook.plan.id}.review.json`,
        payload: runbook.review,
      },
      {
        kind: 'maintenance',
        fileName: `${runbook.plan.id}.maintenance.json`,
        payload: runbook.maintenance,
      },
    ],
    requiredStages: Array.from(new Set([
      ...gate.requiredStages,
      ...runbook.stages.filter(stage => stage.required).map(stage => stage.name),
    ])),
    automatedStages: runbook.stages.filter(stage => stage.automated).map(stage => stage.name),
  };
}
