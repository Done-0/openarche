import { homedir } from 'node:os';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateHarnessCompletion, loadHarnessSession, refreshValidationProtocol, synchronizeHarnessSession } from './session.js';
import { recordReviewOutcome } from '../review/loop.js';
import { loadState, saveState } from '../state.js';
import type { HarnessEvidence, MaintenanceProtocol, ReviewProtocol, ValidationProtocol } from '../contracts.js';

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
    const dir = join(repoRoot, '.openarche');
    const files = await readdir(dir);
    const sessions = await Promise.all(files.filter(file => file.endsWith('.session.json')).map(async file => {
      const id = file.slice(0, -'.session.json'.length);
      const mtime = (await stat(join(dir, file))).mtimeMs;
      const session = await loadHarnessSession(repoRoot, id);
      return {
        id,
        mtime,
        ready: session ? evaluateHarnessCompletion(session).ready : false,
      };
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
  const artifactDir = join(request.repoRoot, '.openarche');
  const validationPath = join(artifactDir, `${sessionId}.validation.json`);
  let validation = refreshValidationProtocol(JSON.parse(await readFile(validationPath, 'utf8')) as ValidationProtocol);

  if (request.action === 'validate' || request.action === 'observe') {
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
      validation.observability.evidence = Array.from(new Map([
        ...validation.observability.evidence,
        ...request.observabilityEvidence,
      ].map(item => [`${item.summary}-${item.path}`, item])).values());
    }
    validation = refreshValidationProtocol(validation);
    await writeFile(validationPath, JSON.stringify(validation, null, 2), 'utf8');
  }

  if (request.action === 'review') {
    const path = join(artifactDir, `${sessionId}.review.json`);
    const review = JSON.parse(await readFile(path, 'utf8')) as ReviewProtocol;
    review.loop = recordReviewOutcome(review.loop, request.reviewState ?? {}, validation.ready);
    await writeFile(path, JSON.stringify(review, null, 2), 'utf8');
  }

  if (request.action === 'maintain') {
    const path = join(artifactDir, `${sessionId}.maintenance.json`);
    const maintenance = JSON.parse(await readFile(path, 'utf8')) as MaintenanceProtocol;
    maintenance.spec = { ...maintenance.spec, ...(request.maintenance ?? {}) };
    await writeFile(path, JSON.stringify(maintenance, null, 2), 'utf8');
  }

  await synchronizeHarnessSession(request.repoRoot, sessionId);
  const session = await loadHarnessSession(request.repoRoot, sessionId);
  const statePath = join(homedir(), '.claude', 'openarche', 'state.json');
  const state = await loadState(statePath);
  if (!session) {
    state.activeSession = null;
  } else {
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
  }
  await saveState(statePath, state);
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
