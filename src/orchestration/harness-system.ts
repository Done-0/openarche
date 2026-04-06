import { createExecutionPlan, validateExecutionPlan } from '../planning/plan.js';
import { createRunbook } from './runbook.js';
import type { BrowserJourney, HarnessGate, HarnessStageName, PlanStep, ProductManifest, Runbook } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export interface HarnessBundleRequest {
  gate: HarnessGate;
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
  requiredStages: HarnessStageName[];
  automatedStages: HarnessStageName[];
}

export function createHarnessBundle(request: HarnessBundleRequest): HarnessBundle {
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
    gate: request.gate,
    runbook,
    requiredStages: Array.from(new Set([
      ...request.gate.requiredStages,
      ...runbook.stages.filter(stage => stage.required).map(stage => stage.name),
    ])),
    automatedStages: runbook.stages.filter(stage => stage.automated).map(stage => stage.name),
  };
}
