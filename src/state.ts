import { readFile, writeFile } from 'node:fs/promises';
import type { AppState } from './types.js';

const DEFAULT_STATE: AppState = {
  totalMemories: 0,
  lastMatch: null,
  bootstrapping: { current: 0, total: 0 },
};

export async function loadState(statePath: string): Promise<AppState> {
  try {
    const raw = await readFile(statePath, 'utf8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) as Partial<AppState> };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export async function saveState(statePath: string, state: AppState): Promise<void> {
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}
