import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarnessSession, writeHarnessSession } from './session.js';
import type { HarnessSession } from '../contracts.js';
import type { HarnessBundle } from './harness-system.js';

export async function writeHarnessBundle(rootDir: string, bundle: HarnessBundle, existingSession: HarnessSession | null = null): Promise<string[]> {
  const paths: string[] = [];
  const targetDir = join(rootDir, '.openarche');
  await mkdir(targetDir, { recursive: true });
  for (const artifact of bundle.artifacts) {
    const targetPath = join(targetDir, artifact.fileName);
    await writeFile(targetPath, JSON.stringify(artifact.payload, null, 2), 'utf8');
    paths.push(targetPath);
  }
  paths.push(await writeHarnessSession(rootDir, createHarnessSession(bundle, rootDir, paths, existingSession)));
  return paths;
}
