import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ensureAutoHarnessFlow } from '../../orchestration/auto-flow.js';
import { evaluateHarnessCompletion, recordHarnessStageCompletion, synchronizeHarnessSession } from '../../orchestration/session.js';
import { getLastHumanMessage } from './prompt-hook.js';
import type { MaintenanceProtocol } from '../../contracts.js';
import { loadState, saveState } from '../../state.js';
import type { StdinData } from '../../types.js';
import { loadConfig } from '../../config.js';
import { evaluateHarnessGateWithEmbeddings } from '../../orchestration/gates.js';
import { evaluateHarnessPolicy } from '../../orchestration/policy.js';

const BASE_DIR = join(homedir(), '.claude', 'openarche');
const CAPTURE_LOG_PATH = join(BASE_DIR, 'capture-log.json');

async function main(): Promise<void> {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  const raw = chunks.join('');
  if (!raw.trim()) return;

  const stdin = JSON.parse(raw) as StdinData;
  if (!stdin.transcript_path) return;
  let transcript = '';
  try {
    transcript = await readFile(stdin.transcript_path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  if (!transcript) return;

  const promptText = stdin.prompt ?? await getLastHumanMessage(stdin.transcript_path);
  let sawExecutionToolUse = false;
  for (const line of transcript.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as { message?: { role?: string; content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }> } };
      if (entry.message?.role !== 'assistant' || !Array.isArray(entry.message.content)) continue;
      for (const block of entry.message.content) {
        if (block.type !== 'tool_use' || typeof block.name !== 'string') continue;
        if (block.name === 'Read' || block.name === 'Glob' || block.name === 'Grep' || block.name === 'LS' || block.name === 'Skill') {
          continue;
        }
        if (block.name === 'Bash') {
          const command = typeof block.input?.command === 'string' ? block.input.command.replace(/\s+/g, ' ').trim() : '';
          if (
            command
            && (
              /(^|[ (])(rm|mv|cp|touch|mkdir|rmdir|chmod|chown|ln|sed -i|perl -pi|apply_patch)([ )]|$)/.test(command)
              || /(>|>>)/.test(command)
              || /\bgit\s+(add|commit|switch|checkout|restore|reset|clean|rebase|merge|cherry-pick|worktree\s+add|branch\s+-[DM])\b/.test(command)
              || /\b(npm|pnpm|yarn|bun|cargo|go|pytest|python|python3|node|deno|uv|make|just)\s+(run|test|build|start|dev|install|exec)\b/.test(command)
            )
          ) {
            sawExecutionToolUse = true;
            break;
          }
          continue;
        }
        sawExecutionToolUse = true;
        break;
      }
      if (sawExecutionToolUse) break;
    } catch {
      continue;
    }
  }
  let autoFlow = null;
  if (promptText && stdin.cwd) {
    const config = await loadConfig(join(BASE_DIR, 'config.json'));
    const gate = await evaluateHarnessGateWithEmbeddings(promptText, config);
    const policy = await evaluateHarnessPolicy(promptText, config, gate);
    autoFlow = await ensureAutoHarnessFlow(
      BASE_DIR,
      promptText,
      stdin.cwd,
      { materialize: policy.materialize || config.orchestration.persistAfterFirstToolUse && sawExecutionToolUse && gate.required, decision: policy }
    );
  }

  if (stdin.cwd && autoFlow?.sessionId && sawExecutionToolUse) {
    await recordHarnessStageCompletion(
      stdin.cwd,
      autoFlow.sessionId,
      'execute',
      'Task transcript shows execution-capable tool activity for this harness session.',
      [stdin.transcript_path]
    );
  }

  if (stdin.cwd && autoFlow?.sessionId) {
    const maintenancePath = join(stdin.cwd, '.openarche', `${autoFlow.sessionId}.maintenance.json`);
    try {
      const maintenance = JSON.parse(await readFile(maintenancePath, 'utf8')) as MaintenanceProtocol;
      maintenance.spec.knowledgeCapture = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY ? 'queued' : 'not_applicable';
      maintenance.spec.knowledgeCaptureSummary =
        maintenance.spec.knowledgeCapture === 'queued'
          ? 'Knowledge capture has been queued for this task transcript.'
          : 'Knowledge capture is skipped because extraction credentials are not configured.';
      maintenance.spec.followupsRecorded = true;
      await writeFile(maintenancePath, JSON.stringify(maintenance, null, 2), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (stdin.cwd && autoFlow?.sessionId) {
    const synchronized = await synchronizeHarnessSession(stdin.cwd, autoFlow.sessionId);
    const state = await loadState(join(BASE_DIR, 'state.json'));
    if (synchronized) {
      const completion = evaluateHarnessCompletion(synchronized);
      state.activeSession = completion.ready
        ? null
        : {
            id: synchronized.id,
            complexity: synchronized.complexity,
            incompleteStages: completion.incompleteStages,
            summary: `Harness opened. Remaining stages: ${completion.incompleteStages.join(', ')}.`,
            updatedAt: Date.now(),
          };
      await saveState(join(BASE_DIR, 'state.json'), state);
    }
  }

  const closeoutPath = fileURLToPath(new URL('../../orchestration/closeout-worker.js', import.meta.url));
  const tmpFile = join(tmpdir(), `openarche-closeout-${Date.now()}-${randomBytes(4).toString('hex')}.json`);
  await writeFile(tmpFile, JSON.stringify({
    transcriptPath: stdin.transcript_path,
    transcript,
    cwd: stdin.cwd ?? '',
    baseDir: BASE_DIR,
    processedPath: CAPTURE_LOG_PATH,
    repoRoot: stdin.cwd,
    sessionId: autoFlow?.sessionId ?? undefined,
  }), 'utf8');
  const child = spawn(process.execPath, [closeoutPath, tmpFile], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
