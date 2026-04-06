import { createHash } from 'node:crypto';
import { mutateJsonFile, readJsonFile } from '../runtime/json-store.js';

function createDefaultCaptureLog(): string[] {
  return [];
}

export function createTranscriptFingerprint(transcriptPath: string): string {
  return createHash('sha256').update(transcriptPath).digest('hex').slice(0, 16);
}

export async function loadCaptureLog(processedPath: string): Promise<Set<string>> {
  return new Set(await readJsonFile(processedPath, createDefaultCaptureLog));
}

export async function hasCaptureLogEntry(processedPath: string, fingerprint: string): Promise<boolean> {
  return (await loadCaptureLog(processedPath)).has(fingerprint);
}

export async function markCaptureLogEntry(processedPath: string, fingerprint: string): Promise<boolean> {
  return mutateJsonFile(processedPath, createDefaultCaptureLog, entries => {
    if (!entries.includes(fingerprint)) {
      entries.push(fingerprint);
      return true;
    }
    return false;
  });
}

export async function deleteCaptureLogEntry(processedPath: string, fingerprint: string): Promise<void> {
  await mutateJsonFile(processedPath, createDefaultCaptureLog, entries => {
    const index = entries.indexOf(fingerprint);
    if (index >= 0) entries.splice(index, 1);
  });
}
