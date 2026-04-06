import type { AppState } from './types.js';
import { mutateJsonFile, readJsonFile, writeJsonFile } from './runtime/json-store.js';

const DEFAULT_STATE: AppState = {
  knowledgeCount: 0,
  lastRecall: null,
  captureSync: { current: 0, total: 0 },
  activeSession: null,
};

export async function loadState(statePath: string): Promise<AppState> {
  const state = await readJsonFile(statePath, () => structuredClone(DEFAULT_STATE));
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
}

export async function saveState(statePath: string, state: AppState): Promise<void> {
  await writeJsonFile(statePath, state);
}

export async function mutateState<T>(statePath: string, mutate: (state: AppState) => Promise<T> | T): Promise<T> {
  return mutateJsonFile(statePath, () => structuredClone(DEFAULT_STATE), mutate);
}
