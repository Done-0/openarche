import { dirname, join } from 'node:path';
import type { WorktreeSessionSpec } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createWorktreeSessionSpec(
  taskId: string,
  repoRoot: string,
  config: ProductConfig,
  baseRef = config.execution.baseRef
): WorktreeSessionSpec {
  const useWorktree = config.execution.isolationStrategy === 'git-worktree';
  const sessionPath = useWorktree ? join(dirname(repoRoot), taskId) : repoRoot;
  return {
    taskId,
    repoRoot,
    sessionPath,
    baseRef,
    isolationStrategy: config.execution.isolationStrategy,
    setupCommands: [
      'git fetch --all --prune',
      useWorktree
        ? `[ -d "${sessionPath}" ] || git worktree add "${sessionPath}" ${baseRef}`
        : `git rev-parse --verify ${taskId} >/dev/null 2>&1 && git switch ${taskId} || git switch -c ${taskId} ${baseRef}`,
    ],
    automated: true,
  };
}
