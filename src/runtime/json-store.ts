import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

async function acquireFileLock(lockPath: string): Promise<void> {
  let waited = 0;
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (waited >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for file lock: ${lockPath}`);
      }
      await new Promise(resolve => setTimeout(resolve, LOCK_WAIT_MS));
      waited += LOCK_WAIT_MS;
    }
  }
}

async function releaseFileLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function readJsonFile<T>(filePath: string, createDefault: () => T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefault();
    }
    throw error;
  }
}

export async function writeJsonFile(filePath: string, value: unknown, lockHeld = false): Promise<void> {
  const lockPath = `${filePath}.lock`;
  if (!lockHeld) {
    await acquireFileLock(lockPath);
  }
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    await rename(tmpPath, filePath);
  } finally {
    try {
      await unlink(tmpPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!lockHeld) {
      await releaseFileLock(lockPath);
    }
  }
}

export async function mutateJsonFile<T, R>(
  filePath: string,
  createDefault: () => T,
  mutate: (value: T) => Promise<R> | R
): Promise<R> {
  const lockPath = `${filePath}.lock`;
  await acquireFileLock(lockPath);
  try {
    const value = await readJsonFile(filePath, createDefault);
    const result = await mutate(value);
    await writeJsonFile(filePath, value, true);
    return result;
  } finally {
    await releaseFileLock(lockPath);
  }
}

export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  const lockPath = `${filePath}.lock`;
  await acquireFileLock(lockPath);
  try {
    await mkdir(dirname(filePath), { recursive: true });
    let existing = '';
    try {
      existing = await readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const next = existing ? `${existing.replace(/\s*$/, '')}\n${JSON.stringify(value)}` : `${JSON.stringify(value)}\n`;
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(tmpPath, next, 'utf8');
      await rename(tmpPath, filePath);
    } finally {
      try {
        await unlink(tmpPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  } finally {
    await releaseFileLock(lockPath);
  }
}
