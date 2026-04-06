import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderStatusSummary } from '../../orchestration/status-summary.js';
import { loadState } from '../../state.js';

async function main(): Promise<void> {
  const statePath = join(homedir(), '.claude', 'openarche', 'state.json');
  const state = await loadState(statePath);
  process.stdout.write(renderStatusSummary(state));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => process.stdout.write('○ Arche'));
}
