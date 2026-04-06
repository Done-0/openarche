import { createBrowserValidationSpec } from '../validation/browser.js';
import { createMaintenanceSpec, refreshMaintenanceSpec } from '../maintenance/sweep.js';
import { createObservabilitySpec, refreshObservabilitySpec } from '../observability/queries.js';
import { createReviewLoopSpec, discoverMechanicalChecks, refreshReviewLoopSpec } from '../review/loop.js';
import { createWorktreeSessionSpec } from '../execution/worktree.js';
import { refreshBrowserValidationSpec } from '../validation/browser.js';
import type { BrowserJourney, ExecutionPlan, HarnessStage, ProductManifest, Runbook } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createRunbook(
  manifest: ProductManifest,
  config: ProductConfig,
  plan: ExecutionPlan,
  repoRoot: string,
  services: string[],
  objective: string,
  journeys: BrowserJourney[]
): Runbook {
  const browser = createBrowserValidationSpec(journeys, config);
  const observability = config.observability.enabled && services.length > 0 ? refreshObservabilitySpec(createObservabilitySpec(services, objective, config)) : null;
  const reviewLoop = refreshReviewLoopSpec(createReviewLoopSpec(config), false);
  const maintenanceSpec = refreshMaintenanceSpec(createMaintenanceSpec(manifest, config));
  const validation = {
    automated: true,
    acceptanceChecks: plan.acceptanceCriteria.map(criterion => ({
      id: criterion.id,
      description: criterion.description,
      status: 'pending' as const,
      evidence: [],
    })),
    regressionChecks: [
      {
        id: 'rg-1',
        description: 'Critical user journeys still succeed.',
        status: 'pending' as const,
        evidence: [],
      },
      {
        id: 'rg-2',
        description: 'No architectural boundary checks regress.',
        status: 'pending' as const,
        evidence: [],
      },
    ],
    browser: refreshBrowserValidationSpec(browser),
    observability,
    ready: false,
    blockers: [
      ...plan.acceptanceCriteria.map(criterion => `${criterion.description} is not verified yet.`),
      'Regression checks are not complete.',
      ...(browser ? browser.blockers : []),
      ...(observability ? observability.blockers : []),
    ],
  };
  const stages: HarnessStage[] = [
    {
      name: 'plan',
      goal: 'Lock the objective, execution steps, and acceptance criteria before code changes.',
      automated: true,
      required: true,
      exitCriteria: validation.acceptanceChecks.map(criterion => criterion.description),
    },
    {
      name: 'execute',
      goal: 'Apply the change inside an isolated execution session.',
      automated: false,
      required: true,
      exitCriteria: ['The task session is isolated from the default workspace.'],
    },
    {
      name: 'validate',
      goal: 'Attach validation evidence before the task can be considered complete.',
      automated: true,
      required: true,
      exitCriteria: plan.acceptanceCriteria.map(criterion => criterion.description),
    },
    {
      name: 'observe',
      goal: 'Inspect runtime signals when behavior, performance, or reliability matters.',
      automated: observability !== null,
      required: observability !== null,
      exitCriteria: observability ? ['Observability checks do not contradict the change.'] : ['Observability checks are not required for this task.'],
    },
    {
      name: 'review',
      goal: 'Run review and repair loops before merge.',
      automated: true,
      required: true,
      exitCriteria: reviewLoop.mergeChecks.map(check => check.description),
    },
    {
      name: 'maintain',
      goal: 'Capture durable knowledge and queue follow-up cleanup.',
      automated: true,
      required: true,
      exitCriteria: ['Reusable engineering knowledge is captured or explicitly absent.', 'Follow-up maintenance work is identified.'],
    },
  ];
  return {
    plan,
    stages,
    worktree: createWorktreeSessionSpec(plan.id, repoRoot, config),
    validation: {
      ...validation,
    },
    review: {
      automated: true,
      blockers: [
        'Acceptance criteria remain unmet.',
        'Validation evidence is missing.',
        'Review findings are unresolved.',
      ],
      loop: reviewLoop,
      checks: discoverMechanicalChecks(repoRoot),
    },
    maintenance: {
      automated: true,
      followups: maintenanceSpec.cleanupTasks,
      spec: maintenanceSpec,
    },
    automationNotes: [
      'Non-trivial changes must pass through plan, execute, validate, review, and maintain stages.',
      'Execution should stay isolated from the default workspace.',
      'Validation and review evidence should be attached before merge.',
    ],
  };
}
