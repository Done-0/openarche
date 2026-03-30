import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadState } from '../state.js';
import type { AppState } from '../types.js';

const RECENT_MATCH_MS = 10 * 60 * 1000;

export function renderStatusLine(state: AppState): string {
  if (state.bootstrapping.total > 0) {
    return `◉ Arche  extracting ${state.bootstrapping.current}/${state.bootstrapping.total}...`;
  }
  if (state.totalMemories === 0) {
    return '○ Arche  no memories yet';
  }
  const base = `◉ Arche  ${state.totalMemories} memories`;
  if (state.lastMatch && Date.now() - state.lastMatch.at < RECENT_MATCH_MS) {
    const mins = Math.round((Date.now() - state.lastMatch.at) / 60000);
    const ago = mins < 1 ? '<1m ago' : `${mins}m ago`;
    return `${base} │ last: ${state.lastMatch.count} matched · ${ago}`;
  }
  return base;
}

async function main(): Promise<void> {
  const statePath = join(homedir(), '.claude', 'openarche', 'state.json');
  const state = await loadState(statePath);
  process.stdout.write(renderStatusLine(state));
}

// Only run when executed directly (not when imported by test runner)
if (!process.argv[1]?.includes('.test.')) {
  main().catch(() => process.stdout.write('○ Arche'));
}
