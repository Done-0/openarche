import { readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deleteCaptureLogEntry } from '../knowledge/capture-log.js';
import { extractKnowledgeFromPayload, type TempPayload } from '../knowledge/extraction.js';
import { cleanupHarnessSessions, mutateHarnessSession, synchronizeHarnessSession } from './session.js';

async function main(): Promise<void> {
  const tmpFile = process.argv[2];
  if (!tmpFile) return;

  const payload = JSON.parse(await readFile(tmpFile, 'utf8')) as TempPayload;
  try {
    await unlink(tmpFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let knowledgeCapture: 'captured' | 'not_applicable' | 'failed' = 'failed';
  let knowledgeCaptureSummary = 'Knowledge capture failed before completion.';
  try {
    const result = await extractKnowledgeFromPayload(payload);
    knowledgeCapture = result.status;
    knowledgeCaptureSummary =
      result.status === 'captured'
        ? result.extracted > 0
          ? `Knowledge capture finished with ${result.extracted} reusable item${result.extracted === 1 ? '' : 's'}.`
          : 'Knowledge capture finished and found no reusable item.'
        : 'Knowledge capture was skipped because extraction credentials are not configured.';
    if (result.status === 'not_applicable' && payload.closeoutEntry) {
      await deleteCaptureLogEntry(payload.processedPath, payload.closeoutEntry);
    }
  } catch (error) {
    knowledgeCaptureSummary = `Knowledge capture failed: ${error instanceof Error ? error.message : String(error)}`;
    if (payload.closeoutEntry) await deleteCaptureLogEntry(payload.processedPath, payload.closeoutEntry);
  }

  if (!payload.repoRoot || !payload.sessionId) return;
  const updated = await mutateHarnessSession(payload.repoRoot, payload.sessionId, session => {
    session.runbook.maintenance.spec.knowledgeCapture = knowledgeCapture;
    session.runbook.maintenance.spec.knowledgeCaptureSummary = knowledgeCaptureSummary;
    session.runbook.maintenance.spec.followupsRecorded = true;
  });
  if (updated === null) process.stderr.write(`Missing maintenance artifact for harness session ${payload.sessionId}.`);

  await synchronizeHarnessSession(payload.repoRoot, payload.sessionId);
  await cleanupHarnessSessions(payload.repoRoot);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
