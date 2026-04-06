import { mkdir, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessBundle } from './harness-system.js';
import { refreshMaintenanceSpec } from '../maintenance/sweep.js';
import { refreshObservabilitySpec } from '../observability/queries.js';
import { refreshReviewProtocol } from '../review/loop.js';
import { refreshBrowserValidationSpec } from '../validation/browser.js';
import type { HarnessCompletion, HarnessSession, HarnessStageName } from '../contracts.js';
import { mutateJsonFile, readJsonFile, writeJsonFile } from '../runtime/json-store.js';

export function getHarnessRootDir(rootDir: string): string {
  return join(rootDir, '.openarche');
}

export function getHarnessSessionsDir(rootDir: string): string {
  return join(getHarnessRootDir(rootDir), 'sessions');
}

export function getHarnessSessionDir(rootDir: string, sessionId: string): string {
  return join(getHarnessSessionsDir(rootDir), sessionId);
}

export function getHarnessSessionStatePath(rootDir: string, sessionId: string): string {
  return join(getHarnessSessionDir(rootDir, sessionId), 'state.json');
}

export function getHarnessSessionEvidenceDir(rootDir: string, sessionId: string): string {
  return join(getHarnessSessionDir(rootDir, sessionId), 'evidence');
}

function createStageStates(bundle: HarnessBundle, existingSession?: HarnessSession | null): HarnessSession['stageStates'] {
  const now = Date.now();
  const byName = new Map(existingSession?.stageStates.map(stage => [stage.name, stage]) ?? []);
  return [
    {
      name: 'plan',
      status: byName.get('plan')?.status ?? 'completed',
      updatedAt: now,
      summary: byName.get('plan')?.summary ?? 'Plan and runbook state is recorded.',
      artifactPaths: byName.get('plan')?.artifactPaths ?? [],
    },
    {
      name: 'execute',
      status: byName.get('execute')?.status ?? 'pending',
      updatedAt: now,
      summary: byName.get('execute')?.summary ?? 'Execution evidence has not been recorded yet.',
      artifactPaths: byName.get('execute')?.artifactPaths ?? [],
    },
    {
      name: 'validate',
      status: byName.get('validate')?.status ?? 'pending',
      updatedAt: now,
      summary: byName.get('validate')?.summary ?? 'Validation evidence has not been recorded yet.',
      artifactPaths: byName.get('validate')?.artifactPaths ?? [],
    },
    {
      name: 'observe',
      status: byName.get('observe')?.status ?? (bundle.requiredStages.includes('observe') ? 'pending' : 'completed'),
      updatedAt: now,
      summary: byName.get('observe')?.summary
        ?? (bundle.requiredStages.includes('observe') ? 'Observability evidence has not been recorded yet.' : 'Observability is not required for this task.'),
      artifactPaths: byName.get('observe')?.artifactPaths ?? [],
    },
    {
      name: 'review',
      status: byName.get('review')?.status ?? 'pending',
      updatedAt: now,
      summary: byName.get('review')?.summary ?? 'Review evidence has not been recorded yet.',
      artifactPaths: byName.get('review')?.artifactPaths ?? [],
    },
    {
      name: 'maintain',
      status: byName.get('maintain')?.status ?? 'pending',
      updatedAt: now,
      summary: byName.get('maintain')?.summary ?? 'Maintenance follow-up has not been recorded yet.',
      artifactPaths: byName.get('maintain')?.artifactPaths ?? [],
    },
  ];
}

export function createHarnessSession(bundle: HarnessBundle, repoRoot: string, existingSession?: HarnessSession | null): HarnessSession {
  const now = Date.now();
  return {
    version: (existingSession?.version ?? 0) + 1,
    id: bundle.runbook.plan.id,
    objective: bundle.runbook.plan.objective,
    complexity: bundle.gate.complexity,
    required: bundle.gate.required,
    requiredStages: bundle.requiredStages,
    automatedStages: bundle.automatedStages,
    repoRoot,
    updatedAt: now,
    archivedAt: existingSession?.archivedAt ?? null,
    archiveReason: existingSession?.archiveReason ?? null,
    runbook: {
      ...bundle.runbook,
      validation: existingSession?.runbook.validation ?? bundle.runbook.validation,
      review: existingSession?.runbook.review ?? bundle.runbook.review,
      maintenance: existingSession?.runbook.maintenance ?? bundle.runbook.maintenance,
    },
    stageStates: createStageStates(bundle, existingSession),
  };
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
  const targetPath = getHarnessSessionStatePath(rootDir, session.id);
  await writeJsonFile(targetPath, session);
  return targetPath;
}

export async function loadHarnessSession(rootDir: string, sessionId: string): Promise<HarnessSession | null> {
  try {
    return await readJsonFile(getHarnessSessionStatePath(rootDir, sessionId), () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function refreshValidationProtocol(validation: HarnessSession['runbook']['validation']): HarnessSession['runbook']['validation'] {
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
  try {
    return await mutateJsonFile<HarnessSession, HarnessSession>(
      getHarnessSessionStatePath(rootDir, sessionId),
      (): HarnessSession => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      session => {
        const now = Date.now();
        const validation = refreshValidationProtocol(session.runbook.validation);
        const review = refreshReviewProtocol(session.runbook.review, validation.ready);
        session.runbook.maintenance.spec = refreshMaintenanceSpec(session.runbook.maintenance.spec);
        session.runbook.validation = validation;
        session.runbook.review = review;
        session.updatedAt = now;
        session.stageStates = session.stageStates.map(stage => {
          const alreadyCompleted = stage.status === 'completed';
          if (stage.name === 'plan') {
            return { ...stage, status: 'completed', updatedAt: now, summary: 'Plan and runbook state is recorded.' };
          }
          if (stage.name === 'execute' && alreadyCompleted) {
            return { ...stage, updatedAt: now, summary: stage.summary || `Execution session defined at ${session.runbook.worktree.sessionPath}.` };
          }
          if (stage.name === 'validate') {
            const ready = validation.ready || alreadyCompleted;
            return {
              ...stage,
              status: ready ? 'completed' : 'pending',
              updatedAt: now,
              summary: ready ? 'Validation evidence satisfies the protocol.' : validation.blockers.join(' '),
            };
          }
          if (stage.name === 'observe') {
            const ready = !session.requiredStages.includes('observe') || !!validation.observability?.ready || alreadyCompleted;
            return {
              ...stage,
              status: ready ? 'completed' : 'pending',
              updatedAt: now,
              summary: ready ? 'Observability stage is satisfied.' : (validation.observability?.blockers.join(' ') ?? 'Observability evidence is still required.'),
            };
          }
          if (stage.name === 'review') {
            const ready = review.blockers.length === 0 || alreadyCompleted;
            return {
              ...stage,
              status: ready ? 'completed' : 'pending',
              updatedAt: now,
              summary: ready ? 'Review gates are satisfied.' : review.blockers.join(' '),
            };
          }
          if (stage.name === 'maintain') {
            const ready = session.runbook.maintenance.spec.ready || alreadyCompleted;
            return {
              ...stage,
              status: ready ? 'completed' : 'pending',
              updatedAt: now,
              summary: ready ? session.runbook.maintenance.spec.knowledgeCaptureSummary : session.runbook.maintenance.spec.blockers.join(' '),
            };
          }
          return stage;
        });
        session.version += 1;
        return session;
      }
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function mutateHarnessSession<T>(
  rootDir: string,
  sessionId: string,
  mutate: (session: HarnessSession) => Promise<T> | T
): Promise<T | null> {
  try {
    return await mutateJsonFile<HarnessSession, T>(
      getHarnessSessionStatePath(rootDir, sessionId),
      (): HarnessSession => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      async session => {
        const result = await mutate(session);
        session.updatedAt = Date.now();
        session.version += 1;
        return result;
      }
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function recordHarnessStageCompletion(
  rootDir: string,
  sessionId: string,
  stageName: HarnessStageName,
  summary: string,
  artifactPaths: string[] = []
): Promise<HarnessSession | null> {
  const updated = await mutateHarnessSession(rootDir, sessionId, session => {
    const now = Date.now();
    session.stageStates = session.stageStates.map(stage => stage.name !== stageName
      ? stage
      : {
          ...stage,
          status: 'completed',
          updatedAt: now,
          summary,
          artifactPaths: Array.from(new Set([...stage.artifactPaths, ...artifactPaths])),
        });
    return session;
  });
  return updated ? synchronizeHarnessSession(rootDir, sessionId) : null;
}

export async function cleanupHarnessSessions(rootDir: string): Promise<void> {
  let sessionDirs: string[] = [];
  try {
    sessionDirs = await readdir(getHarnessSessionsDir(rootDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const now = Date.now();
  for (const sessionId of sessionDirs) {
    const session = await loadHarnessSession(rootDir, sessionId);
    if (!session) continue;
    const completion = evaluateHarnessCompletion(session);
    const age = now - session.updatedAt;
    let archiveReason: HarnessSession['archiveReason'] = null;
    if (completion.ready && age > 24 * 60 * 60 * 1000) {
      archiveReason = 'completed';
    } else if (!completion.ready && age > 7 * 24 * 60 * 60 * 1000) {
      archiveReason = 'stale';
    }
    if (!archiveReason) continue;
    session.archivedAt = now;
    session.archiveReason = archiveReason;
    session.version += 1;
    await writeHarnessSession(rootDir, session);
    let archiveDir = archiveReason === 'completed'
      ? join(getHarnessRootDir(rootDir), 'completed', sessionId)
      : join(getHarnessRootDir(rootDir), 'completed', 'stale', sessionId);
    try {
      await mkdir(join(archiveDir, '..'), { recursive: true });
      await rename(getHarnessSessionDir(rootDir, sessionId), archiveDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error;
      archiveDir = archiveReason === 'completed'
        ? join(getHarnessRootDir(rootDir), 'completed', `${sessionId}-${now}`)
        : join(getHarnessRootDir(rootDir), 'completed', 'stale', `${sessionId}-${now}`);
      await mkdir(join(archiveDir, '..'), { recursive: true });
      await rename(getHarnessSessionDir(rootDir, sessionId), archiveDir);
    }
  }
}
