import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AppState } from './types.js';

const DEFAULT_STATE: AppState = {
  knowledgeCount: 0,
  lastRecall: null,
  captureSync: { current: 0, total: 0 },
  activeSession: null,
};

export async function loadState(statePath: string): Promise<AppState> {
  try {
    const raw = await readFile(statePath, 'utf8');
    const state = JSON.parse(raw) as AppState;
    if (
      typeof state.knowledgeCount !== 'number'
      || !state.captureSync
      || typeof state.captureSync.current !== 'number'
      || typeof state.captureSync.total !== 'number'
      || (state.activeSession !== null && (
        typeof state.activeSession.id !== 'string'
        || typeof state.activeSession.complexity !== 'string'
        || typeof state.activeSession.summary !== 'string'
        || typeof state.activeSession.updatedAt !== 'number'
        || !Array.isArray(state.activeSession.incompleteStages)
      ))
      || (state.lastRecall !== null && (
        typeof state.lastRecall.count !== 'number'
        || typeof state.lastRecall.at !== 'number'
        || !Array.isArray(state.lastRecall.titles)
      ))
    ) {
      throw new Error('Invalid state shape');
    }
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return structuredClone(DEFAULT_STATE);
    }
    throw error;
  }
}

export async function saveState(statePath: string, state: AppState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}
