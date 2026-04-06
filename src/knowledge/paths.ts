import { join } from 'node:path';

export interface KnowledgeStorePaths {
  baseDir: string;
  indexPath: string;
  knowledgeDir: string;
  scope: 'global' | 'repo';
}

export function getGlobalKnowledgeStorePaths(baseDir: string): KnowledgeStorePaths {
  return {
    baseDir,
    indexPath: join(baseDir, 'index.json'),
    knowledgeDir: join(baseDir, 'knowledge'),
    scope: 'global',
  };
}

export function getRepoKnowledgeStorePaths(repoRoot: string): KnowledgeStorePaths {
  const baseDir = join(repoRoot, '.openarche', 'knowledge');
  return {
    baseDir,
    indexPath: join(baseDir, 'index.json'),
    knowledgeDir: baseDir,
    scope: 'repo',
  };
}
