import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractKnowledgeFromPayload, type TempPayload } from '../knowledge/extraction.js';
import type { MaintenanceProtocol } from '../contracts.js';
import { synchronizeHarnessSession } from './session.js';

async function main(): Promise<void> {
  const tmpFile = process.argv[2];
  if (!tmpFile) return;

  const payload = JSON.parse(await readFile(tmpFile, 'utf8')) as TempPayload;
  try {
    await unlink(tmpFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  let knowledgeCapture: MaintenanceProtocol['spec']['knowledgeCapture'] = 'failed';
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
  } catch (error) {
    knowledgeCapture = 'failed';
    knowledgeCaptureSummary = `Knowledge capture failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (!payload.repoRoot || !payload.sessionId) return;

  const maintenancePath = join(payload.repoRoot, '.openarche', `${payload.sessionId}.maintenance.json`);
  try {
    const maintenance = JSON.parse(await readFile(maintenancePath, 'utf8')) as MaintenanceProtocol;
    maintenance.spec.knowledgeCapture = knowledgeCapture;
    maintenance.spec.knowledgeCaptureSummary = knowledgeCaptureSummary;
    maintenance.spec.followupsRecorded = true;
    await writeFile(maintenancePath, JSON.stringify(maintenance, null, 2), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    process.stderr.write(`Missing maintenance artifact for harness session ${payload.sessionId}.`);
  }

  await synchronizeHarnessSession(payload.repoRoot, payload.sessionId);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
