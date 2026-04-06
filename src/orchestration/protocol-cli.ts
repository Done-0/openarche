import { homedir } from 'node:os';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordReviewOutcome, refreshReviewProtocol } from '../review/loop.js';
import { mutateState } from '../state.js';
import type { HarnessEvidence, MaintenanceProtocol, ReviewProtocol, ValidationProtocol } from '../contracts.js';
import { evaluateHarnessCompletion, getHarnessSessionsDir, loadHarnessSession, mutateHarnessSession, refreshValidationProtocol, synchronizeHarnessSession } from './session.js';

export interface ProtocolUpdateRequest {
  repoRoot: string;
  sessionId?: string;
  action: 'validate' | 'observe' | 'review' | 'maintain';
  acceptancePassed?: string[];
  regressionPassed?: string[];
  browserJourneys?: Array<{
    name: string;
    beforeFixReproduced?: boolean;
    navigationCaptured?: boolean;
    domSnapshotCaptured?: boolean;
    screenshotCaptured?: boolean;
    afterFixValidated?: boolean;
    evidence?: HarnessEvidence[];
  }>;
  observabilityEvidence?: HarnessEvidence[];
  reviewState?: Partial<ReviewProtocol['loop']['state']>;
  maintenance?: Partial<MaintenanceProtocol['spec']>;
}

export async function resolveSessionId(repoRoot: string, sessionId?: string): Promise<string | null> {
  if (sessionId) return sessionId;
  try {
    const dir = getHarnessSessionsDir(repoRoot);
    const files = await readdir(dir, { withFileTypes: true });
    const sessions = await Promise.all(files.filter(file => file.isDirectory()).map(async file => {
      const id = file.name;
      const mtime = (await stat(join(dir, file.name, 'state.json'))).mtimeMs;
      const session = await loadHarnessSession(repoRoot, id);
      return { id, mtime, ready: session ? evaluateHarnessCompletion(session).ready : false };
    }));
    sessions.sort((a, b) => a.ready === b.ready ? b.mtime - a.mtime : a.ready ? 1 : -1);
    return sessions[0]?.id ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function applyProtocolUpdate(request: ProtocolUpdateRequest): Promise<string | null> {
  const sessionId = await resolveSessionId(request.repoRoot, request.sessionId);
  if (!sessionId) return null;

  if (request.action === 'validate' || request.action === 'observe') {
    await mutateHarnessSession(request.repoRoot, sessionId, session => {
      const validation = session.runbook.validation as ValidationProtocol;
      if (request.acceptancePassed) {
        validation.acceptanceChecks = validation.acceptanceChecks.map(check =>
          request.acceptancePassed?.includes(check.id) || request.acceptancePassed?.includes(check.description)
            ? { ...check, status: 'passed' }
            : check
        );
      }
      if (request.regressionPassed) {
        validation.regressionChecks = validation.regressionChecks.map(check =>
          request.regressionPassed?.includes(check.id) || request.regressionPassed?.includes(check.description)
            ? { ...check, status: 'passed' }
            : check
        );
      }
      if (request.browserJourneys && validation.browser) {
        validation.browser.journeys = validation.browser.journeys.map(journey => {
          const update = request.browserJourneys?.find(entry => entry.name === journey.name);
          if (!update) return journey;
          return {
            ...journey,
            beforeFixReproduced: update.beforeFixReproduced ? 'passed' : journey.beforeFixReproduced,
            navigationCaptured: update.navigationCaptured ? 'passed' : journey.navigationCaptured,
            domSnapshotCaptured: update.domSnapshotCaptured ? 'passed' : journey.domSnapshotCaptured,
            screenshotCaptured: update.screenshotCaptured ? 'passed' : journey.screenshotCaptured,
            afterFixValidated: update.afterFixValidated ? 'passed' : journey.afterFixValidated,
            evidence: update.evidence ? Array.from(new Map([...journey.evidence, ...update.evidence].map(item => [`${item.summary}-${item.path}`, item])).values()) : journey.evidence,
          };
        });
      }
      if (request.observabilityEvidence && validation.observability) {
        validation.observability.evidence = Array.from(new Map([...validation.observability.evidence, ...request.observabilityEvidence].map(item => [`${item.summary}-${item.path}`, item])).values());
      }
      session.runbook.validation = refreshValidationProtocol(validation);
    });
  }

  if (request.action === 'review') {
    await mutateHarnessSession(request.repoRoot, sessionId, session => {
      const review = session.runbook.review as ReviewProtocol;
      review.loop = recordReviewOutcome(review.loop, request.reviewState ?? {}, session.runbook.validation.ready);
      session.runbook.review = refreshReviewProtocol(review, session.runbook.validation.ready);
    });
  }

  if (request.action === 'maintain') {
    await mutateHarnessSession(request.repoRoot, sessionId, session => {
      const maintenance = session.runbook.maintenance as MaintenanceProtocol;
      maintenance.spec = { ...maintenance.spec, ...(request.maintenance ?? {}) };
      session.runbook.maintenance = maintenance;
    });
  }

  await synchronizeHarnessSession(request.repoRoot, sessionId);
  const session = await loadHarnessSession(request.repoRoot, sessionId);
  await mutateState(join(homedir(), '.claude', 'openarche', 'state.json'), state => {
    if (!session) {
      state.activeSession = null;
      return;
    }
    const completion = evaluateHarnessCompletion(session);
    state.activeSession = completion.ready
      ? null
      : {
          id: session.id,
          complexity: session.complexity,
          incompleteStages: completion.incompleteStages,
          summary: `Harness opened. Remaining stages: ${completion.incompleteStages.join(', ')}.`,
          updatedAt: Date.now(),
        };
  });
  return sessionId;
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) return;
  const request = JSON.parse(raw) as ProtocolUpdateRequest;
  const sessionId = await applyProtocolUpdate(request);
  if (sessionId) process.stdout.write(sessionId);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
