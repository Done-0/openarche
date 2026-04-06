import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessBundle } from './harness-system.js';
import { refreshMaintenanceSpec } from '../maintenance/sweep.js';
import { refreshObservabilitySpec } from '../observability/queries.js';
import { refreshReviewLoopSpec } from '../review/loop.js';
import { refreshBrowserValidationSpec } from '../validation/browser.js';
import type { HarnessCompletion, HarnessSession, HarnessStageName, MaintenanceProtocol, ReviewProtocol, Runbook, ValidationProtocol } from '../contracts.js';

export function createHarnessSession(
  bundle: HarnessBundle,
  repoRoot: string,
  artifactPaths: string[],
  existingSession?: HarnessSession | null
): HarnessSession {
  const now = Date.now();
  const session = existingSession
    ? {
        ...existingSession,
        complexity: bundle.gate.complexity,
        required: bundle.gate.required,
        requiredStages: bundle.requiredStages,
        automatedStages: bundle.automatedStages,
        artifactPaths: artifactPaths.length > 0
          ? Array.from(new Set([...existingSession.artifactPaths, ...artifactPaths]))
          : existingSession.artifactPaths,
        sessionFileName: `${bundle.runbook.plan.id}.session.json`,
        repoRoot,
        updatedAt: now,
      }
    : {
        id: bundle.runbook.plan.id,
        objective: bundle.runbook.plan.objective,
        complexity: bundle.gate.complexity,
        required: bundle.gate.required,
        requiredStages: bundle.requiredStages,
        automatedStages: bundle.automatedStages,
        artifactPaths,
        sessionFileName: `${bundle.runbook.plan.id}.session.json`,
        repoRoot,
        updatedAt: now,
        stageStates: [],
      };

  const byStage: Record<HarnessStageName, string[]> = {
    plan: [],
    execute: [],
    validate: [],
    observe: [],
    review: [],
    maintain: [],
  };
  for (let index = 0; index < bundle.artifacts.length; index++) {
    const path = artifactPaths[index];
    if (!path) continue;
    const kind = bundle.artifacts[index]?.kind;
    if (kind === 'plan' || kind === 'runbook') byStage.plan.push(path);
    if (kind === 'validation') byStage.validate.push(path);
    if (kind === 'review') byStage.review.push(path);
    if (kind === 'maintenance') byStage.maintain.push(path);
  }

  session.stageStates = [
    {
      name: 'plan',
      status: existingSession?.stageStates.find(stage => stage.name === 'plan')?.status ?? 'completed',
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'plan')?.summary ?? 'Plan and runbook artifacts are materialized.',
      artifactPaths: Array.from(new Set([
        ...(existingSession?.stageStates.find(stage => stage.name === 'plan')?.artifactPaths ?? []),
        ...byStage.plan,
      ])),
    },
    {
      name: 'execute',
      status: existingSession?.stageStates.find(stage => stage.name === 'execute')?.status ?? 'pending',
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'execute')?.summary ?? 'Execution evidence has not been recorded yet.',
      artifactPaths: existingSession?.stageStates.find(stage => stage.name === 'execute')?.artifactPaths ?? [],
    },
    {
      name: 'validate',
      status: existingSession?.stageStates.find(stage => stage.name === 'validate')?.status ?? 'pending',
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'validate')?.summary ?? 'Validation evidence has not been recorded yet.',
      artifactPaths: Array.from(new Set([
        ...(existingSession?.stageStates.find(stage => stage.name === 'validate')?.artifactPaths ?? []),
        ...byStage.validate,
      ])),
    },
    {
      name: 'observe',
      status: existingSession?.stageStates.find(stage => stage.name === 'observe')?.status ?? (bundle.requiredStages.includes('observe') ? 'pending' : 'completed'),
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'observe')?.summary
        ?? (bundle.requiredStages.includes('observe') ? 'Observability evidence has not been recorded yet.' : 'Observability is not required for this task.'),
      artifactPaths: existingSession?.stageStates.find(stage => stage.name === 'observe')?.artifactPaths ?? [],
    },
    {
      name: 'review',
      status: existingSession?.stageStates.find(stage => stage.name === 'review')?.status ?? 'pending',
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'review')?.summary ?? 'Review evidence has not been recorded yet.',
      artifactPaths: Array.from(new Set([
        ...(existingSession?.stageStates.find(stage => stage.name === 'review')?.artifactPaths ?? []),
        ...byStage.review,
      ])),
    },
    {
      name: 'maintain',
      status: existingSession?.stageStates.find(stage => stage.name === 'maintain')?.status ?? 'pending',
      updatedAt: now,
      summary: existingSession?.stageStates.find(stage => stage.name === 'maintain')?.summary ?? 'Maintenance follow-up has not been recorded yet.',
      artifactPaths: Array.from(new Set([
        ...(existingSession?.stageStates.find(stage => stage.name === 'maintain')?.artifactPaths ?? []),
        ...byStage.maintain,
      ])),
    },
  ];

  return session;
}

export function evaluateHarnessCompletion(session: HarnessSession): HarnessCompletion {
  const completedStages = session.stageStates.filter(stage => stage.status === 'completed').map(stage => stage.name);
  const incompleteStages = session.requiredStages.filter(stage => !completedStages.includes(stage));
  return {
    ready: incompleteStages.length === 0,
    completedStages,
    incompleteStages,
    summary: incompleteStages.length === 0 ? 'All required harness stages are satisfied.' : `Required harness stages still open: ${incompleteStages.join(', ')}.`,
  };
}

export async function writeHarnessSession(rootDir: string, session: HarnessSession): Promise<string> {
  const targetDir = join(rootDir, '.openarche');
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, session.sessionFileName);
  await writeFile(targetPath, JSON.stringify(session, null, 2), 'utf8');
  return targetPath;
}

export async function loadHarnessSession(rootDir: string, sessionId: string): Promise<HarnessSession | null> {
  try {
    return JSON.parse(await readFile(join(rootDir, '.openarche', `${sessionId}.session.json`), 'utf8')) as HarnessSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function refreshValidationProtocol(validation: ValidationProtocol): ValidationProtocol {
  validation.browser = refreshBrowserValidationSpec(validation.browser);
  validation.observability = refreshObservabilitySpec(validation.observability);
  validation.blockers = [
    ...validation.acceptanceChecks.filter(check => check.status !== 'passed').map(check => `${check.description} is not verified yet.`),
    ...validation.regressionChecks.filter(check => check.status !== 'passed').map(check => `${check.description} is not verified yet.`),
    ...(validation.browser?.blockers ?? []),
    ...(validation.observability?.blockers ?? []),
  ];
  validation.ready = validation.blockers.length === 0;
  return validation;
}

export async function synchronizeHarnessSession(rootDir: string, sessionId: string): Promise<HarnessSession | null> {
  const session = await loadHarnessSession(rootDir, sessionId);
  if (!session) return null;
  const artifactDir = join(rootDir, '.openarche');
  const now = Date.now();
  let validation: ValidationProtocol | null = null;
  let review: ReviewProtocol | null = null;
  let maintenance: MaintenanceProtocol | null = null;
  let runbook: Runbook | null = null;

  try {
    validation = refreshValidationProtocol(JSON.parse(await readFile(join(artifactDir, `${sessionId}.validation.json`), 'utf8')) as ValidationProtocol);
    await writeFile(join(artifactDir, `${sessionId}.validation.json`), JSON.stringify(validation, null, 2), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    review = JSON.parse(await readFile(join(artifactDir, `${sessionId}.review.json`), 'utf8')) as ReviewProtocol;
    review.loop = refreshReviewLoopSpec(review.loop, validation?.ready ?? false);
    review.blockers = review.loop.blockers;
    await writeFile(join(artifactDir, `${sessionId}.review.json`), JSON.stringify(review, null, 2), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    maintenance = JSON.parse(await readFile(join(artifactDir, `${sessionId}.maintenance.json`), 'utf8')) as MaintenanceProtocol;
    maintenance.spec = refreshMaintenanceSpec(maintenance.spec);
    await writeFile(join(artifactDir, `${sessionId}.maintenance.json`), JSON.stringify(maintenance, null, 2), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    runbook = JSON.parse(await readFile(join(artifactDir, `${sessionId}.runbook.json`), 'utf8')) as Runbook;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  session.updatedAt = now;
  session.stageStates = session.stageStates.map(stage => {
    const alreadyCompleted = stage.status === 'completed';
    if (stage.name === 'plan') {
      return {
        ...stage,
        status: 'completed',
        updatedAt: now,
        summary: 'Plan and runbook artifacts are materialized.',
      };
    }
    if (stage.name === 'validate' && validation) {
      return {
        ...stage,
        status: validation.ready || alreadyCompleted ? 'completed' : 'pending',
        updatedAt: now,
        summary: validation.ready || alreadyCompleted ? 'Validation evidence satisfies the protocol.' : validation.blockers.join(' '),
      };
    }
    if (stage.name === 'observe') {
      const observeRequired = session.requiredStages.includes('observe');
      const observeReady = !observeRequired || !!validation?.observability?.ready;
      return {
        ...stage,
        status: observeReady || alreadyCompleted ? 'completed' : 'pending',
        updatedAt: now,
        summary: observeReady || alreadyCompleted ? 'Observability stage is satisfied.' : (validation?.observability?.blockers.join(' ') ?? 'Observability evidence is still required.'),
      };
    }
    if (stage.name === 'review' && review) {
      return {
        ...stage,
        status: review.loop.ready || alreadyCompleted ? 'completed' : 'pending',
        updatedAt: now,
        summary: review.loop.ready || alreadyCompleted ? 'Review gates are satisfied.' : review.blockers.join(' '),
      };
    }
    if (stage.name === 'maintain' && maintenance) {
      return {
        ...stage,
        status: maintenance.spec.ready || alreadyCompleted ? 'completed' : 'pending',
        updatedAt: now,
        summary: maintenance.spec.ready || alreadyCompleted ? maintenance.spec.knowledgeCaptureSummary : maintenance.spec.blockers.join(' '),
      };
    }
    if (stage.name === 'execute' && runbook && stage.status === 'completed') {
      return {
        ...stage,
        updatedAt: now,
        summary: stage.summary || `Execution session defined at ${runbook.worktree.sessionPath}.`,
      };
    }
    return stage;
  });
  await writeHarnessSession(rootDir, session);
  return session;
}

export async function recordHarnessStageCompletion(
  rootDir: string,
  sessionId: string,
  stageName: HarnessStageName,
  summary: string,
  artifactPaths: string[] = []
): Promise<HarnessSession | null> {
  const session = await loadHarnessSession(rootDir, sessionId);
  if (!session) return null;
  const now = Date.now();
  session.updatedAt = now;
  session.stageStates = session.stageStates.map(stage => stage.name !== stageName
    ? stage
    : {
        ...stage,
        status: 'completed',
        updatedAt: now,
        summary,
        artifactPaths: Array.from(new Set([...stage.artifactPaths, ...artifactPaths])),
      });
  await writeHarnessSession(rootDir, session);
  return session;
}
