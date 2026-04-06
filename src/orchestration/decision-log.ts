import { join } from 'node:path';
import type { HarnessGate } from '../contracts.js';
import type { HarnessPolicyDecision } from './policy.js';
import { appendJsonLine } from '../runtime/json-store.js';

export async function appendHarnessDecisionLog(
  baseDir: string,
  entry: {
    repoRoot?: string;
    prompt: string;
    gate: HarnessGate;
    policy: HarnessPolicyDecision;
    decision: 'skip' | 'inject_only' | 'materialize';
    sessionId: string | null;
  }
): Promise<void> {
  try {
    await appendJsonLine(join(baseDir, 'decision-log.jsonl'), {
      timestamp: Date.now(),
      repoRoot: entry.repoRoot ?? null,
      prompt: entry.prompt,
      gate: entry.gate,
      policy: entry.policy,
      decision: entry.decision,
      sessionId: entry.sessionId,
    });
  } catch {
    return;
  }
}
