import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { loadIndex, saveIndex } from '../engine/index-store.js';
import { embed } from '../engine/embedder.js';
import { writeMemory } from '../engine/writer.js';
import { buildLinks, matchLinksHints } from '../engine/graph.js';
import { callHaiku, parseExtractionResult, isValidCandidate } from './index.js';
import type { ArcheEntry } from '../types.js';

export async function findUnprocessedTranscripts(
  projectsDir: string,
  processed: Set<string>
): Promise<string[]> {
  const results: Array<{ path: string; mtime: number }> = [];

  try {
    const projects = await readdir(projectsDir, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectPath = join(projectsDir, project.name);
      try {
        const files = await readdir(projectPath, { withFileTypes: true });
        for (const file of files) {
          if (!file.name.endsWith('.jsonl')) continue;
          const filePath = join(projectPath, file.name);
          if (processed.has(filePath)) continue;
          const s = await stat(filePath);
          results.push({ path: filePath, mtime: s.mtimeMs });
        }
      } catch { continue; }
    }
  } catch { return []; }

  return results
    .sort((a, b) => b.mtime - a.mtime)
    .map(r => r.path);
}

async function loadProcessed(processedPath: string): Promise<Set<string>> {
  try {
    const raw = await readFile(processedPath, 'utf8');
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function markProcessed(processedPath: string, path: string): Promise<void> {
  const set = await loadProcessed(processedPath);
  set.add(path);
  await writeFile(processedPath, JSON.stringify(Array.from(set), null, 2), 'utf8');
}

export async function runBootstrap(
  baseDir: string,
  onProgress: (current: number, total: number) => void
): Promise<{ processed: number; extracted: number }> {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const processedPath = join(baseDir, 'processed.json');
  const statePath = join(baseDir, 'state.json');
  const indexPath = join(baseDir, 'index.json');
  const memoriesDir = join(baseDir, 'memories');

  const config = await loadConfig(join(baseDir, 'config.json'));
  const processed = await loadProcessed(processedPath);
  const unprocessed = await findUnprocessedTranscripts(projectsDir, processed);
  const total = unprocessed.length;

  const state = await loadState(statePath);
  state.bootstrapping = { current: 0, total };
  await saveState(statePath, state);

  const concurrency = config.extraction.bootstrapConcurrency;
  let current = 0;
  let extracted = 0;

  for (let i = 0; i < unprocessed.length; i += concurrency) {
    const batch = unprocessed.slice(i, i + concurrency);
    await Promise.all(batch.map(async (transcriptPath) => {
      try {
        const transcript = await readFile(transcriptPath, 'utf8');
        const raw = await callHaiku(transcript, config);
        const candidates = parseExtractionResult(raw);

        for (const c of candidates) {
          if (!isValidCandidate(c, config.extraction.minQualityScore)) continue;
          const titleEmbedding = await embed(`${c.title} ${c.trigger_context}`, config);
          const id = randomBytes(4).toString('hex');
          const entry: ArcheEntry = {
            id,
            title: c.title,
            type: c.type,
            structure: c.structure,
            tags: c.tags,
            links: [],
            score: c.quality,
            access_count: 0,
            source_project: null,
            trigger_context: c.trigger_context,
            quality: c.quality,
            created_at: Date.now(),
            last_accessed: null,
            embedding: titleEmbedding,
          };
          await writeMemory({ memoriesDir, indexPath, entry, body: c.body });
          if (c.links_hint.length > 0) {
            const freshIndex = await loadIndex(indexPath);
            const hintEmbeddings = await Promise.all(c.links_hint.map(h => embed(h, config)));
            const linkedIds = matchLinksHints(freshIndex, hintEmbeddings, 0.80);
            buildLinks(freshIndex, id, linkedIds.filter(lid => lid !== id));
            await saveIndex(indexPath, freshIndex);
          }
          extracted++;
        }
        await markProcessed(processedPath, transcriptPath);
      } catch { /* skip failed transcripts */ }

      current++;
      onProgress(current, total);
      const s = await loadState(statePath);
      s.bootstrapping = { current, total };
      await saveState(statePath, s);
    }));
  }

  const finalState = await loadState(statePath);
  finalState.bootstrapping = { current: 0, total: 0 };
  finalState.totalMemories = (await loadIndex(indexPath)).memories.length;
  await saveState(statePath, finalState);

  return { processed: current, extracted };
}
