import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { loadIndex, mutateIndex, saveIndex } from './index-store.js';
import { cosineSimilarity, embed } from './embedding.js';
import { buildLinks, matchLinksHints } from './graph.js';
import { callHaiku, parseExtractionResult, isValidCandidate } from './extraction.js';
import type { KnowledgeEntry } from '../types.js';

const MIN_USER_TURNS = 5;
const SILENCE_MS = 12 * 60 * 60 * 1000;

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
          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat || Date.now() - fileStat.mtimeMs < SILENCE_MS) continue;
          try {
            const content = await readFile(filePath, 'utf8');
            if (!content.includes('"tool_use"')) continue;
            const userTurns = content.split('\n').filter(line => {
              try {
                return (JSON.parse(line) as { message?: { role?: string } }).message?.role === 'user';
              } catch {
                return false;
              }
            }).length;
            if (userTurns < MIN_USER_TURNS) continue;
            results.push({ path: filePath, mtime: fileStat.mtimeMs });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  return results.sort((a, b) => b.mtime - a.mtime).map(result => result.path);
}

async function loadProcessed(processedPath: string): Promise<Set<string>> {
  try {
    const raw = await readFile(processedPath, 'utf8');
    return new Set(JSON.parse(raw) as string[]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set();
    }
    throw error;
  }
}

async function writeProcessed(processedPath: string, processed: Set<string>): Promise<void> {
  await mkdir(dirname(processedPath), { recursive: true });
  await writeFile(processedPath, JSON.stringify(Array.from(processed), null, 2), 'utf8');
}

async function markProcessed(processedPath: string, path: string): Promise<void> {
  const set = await loadProcessed(processedPath);
  set.add(path);
  await writeProcessed(processedPath, set);
}

async function writeCaptureSync(statePath: string, current: number, total: number): Promise<void> {
  const state = await loadState(statePath);
  state.captureSync = { current, total };
  await saveState(statePath, state);
}

async function markBootstrapComplete(statePath: string, indexPath: string): Promise<void> {
  const finalState = await loadState(statePath);
  finalState.captureSync = { current: 0, total: 0 };
  finalState.knowledgeCount = (await loadIndex(indexPath)).entries.length;
  await saveState(statePath, finalState);
}

async function handleTranscriptBootstrap(
  transcriptPath: string,
  configPath: string,
  indexPath: string,
  knowledgeDir: string,
  processedPath: string
): Promise<number> {
  const config = await loadConfig(configPath);
  const transcript = await readFile(transcriptPath, 'utf8');
  const raw = await callHaiku(transcript, config);
  const candidates = parseExtractionResult(raw);
  let extracted = 0;

  for (const c of candidates) {
    if (!isValidCandidate(c, config.knowledge.extraction.minQualityScore)) continue;
    const normalizedTitle = c.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    const normalizedTriggerContext = c.trigger_context.replace(/\s+/g, ' ').trim().slice(0, 400);
    const normalizedTags = Array.from(new Set(c.tags.map(tag => tag.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 16);
    const normalizedBody = c.body.replace(/\r\n/g, '\n').trim();
    const titleEmbedding = await embed(`${normalizedTitle} ${normalizedTriggerContext}`, config);
    const id = randomBytes(4).toString('hex');
    let persistedId: string | null = null;
    await mutateIndex(indexPath, async index => {
      let similar: KnowledgeEntry | undefined;
      let bestSim = 0;
      for (const existing of index.entries) {
        const sim = cosineSimilarity(titleEmbedding, existing.embedding);
        if (sim > bestSim) {
          bestSim = sim;
          similar = existing;
        }
      }
      if (bestSim >= 0.95) {
        return;
      }
      persistedId = bestSim >= 0.85 && similar ? similar.id : id;
      const entry: KnowledgeEntry = {
        id: persistedId,
        title: normalizedTitle,
        type: c.type,
        structure: c.structure,
        tags: normalizedTags,
        links: bestSim >= 0.85 && similar ? similar.links : [],
        score: (c.quality_breakdown.reusability * 0.4 + c.quality_breakdown.non_obviousness * 0.3 + c.quality_breakdown.clarity * 0.2 + c.quality_breakdown.completeness * 0.1),
        access_count: bestSim >= 0.85 && similar ? similar.access_count : 0,
        source_project: bestSim >= 0.85 && similar ? similar.source_project : null,
        trigger_context: normalizedTriggerContext,
        quality: (c.quality_breakdown.reusability * 0.4 + c.quality_breakdown.non_obviousness * 0.3 + c.quality_breakdown.clarity * 0.2 + c.quality_breakdown.completeness * 0.1),
        quality_breakdown: c.quality_breakdown,
        created_at: bestSim >= 0.85 && similar ? similar.created_at : Date.now(),
        last_accessed: bestSim >= 0.85 && similar ? similar.last_accessed : null,
        embedding: titleEmbedding,
      };
      await mkdir(knowledgeDir, { recursive: true });
      await writeFile(join(knowledgeDir, `${persistedId}.md`), [
        '---',
        `id: ${entry.id}`,
        `type: ${entry.type}`,
        `structure: ${entry.structure}`,
        `title: ${JSON.stringify(entry.title)}`,
        `trigger_context: ${JSON.stringify(entry.trigger_context)}`,
        `tags: ${JSON.stringify(entry.tags)}`,
        `links: ${JSON.stringify(entry.links)}`,
        `score: ${entry.score}`,
        `quality: ${entry.quality}`,
        `source: ${entry.source_project === null ? 'null' : JSON.stringify(entry.source_project)}`,
        `created: ${new Date(entry.created_at).toISOString().slice(0, 10)}`,
        '---',
        '',
        normalizedBody,
      ].join('\n'), 'utf8');
      if (bestSim >= 0.85 && similar) {
        const existingIndex = index.entries.findIndex(existing => existing.id === similar.id);
        if (existingIndex >= 0) {
          index.entries[existingIndex] = entry;
        }
      } else {
        index.entries.push(entry);
      }
    });
    if (!persistedId) continue;
    const linkedSourceId = persistedId;
    if (c.links_hint.length > 0) {
      const hintEmbeddings = await Promise.all(c.links_hint.map(h => embed(h, config)));
      await mutateIndex(indexPath, freshIndex => {
        const linkedIds = matchLinksHints(freshIndex, hintEmbeddings, 0.80);
        buildLinks(freshIndex, linkedSourceId, linkedIds.filter(lid => lid !== linkedSourceId));
      });
    }
    extracted++;
  }

  await markProcessed(processedPath, transcriptPath);
  return extracted;
}

async function runBootstrap(
  baseDir: string,
  onProgress: (current: number, total: number) => void
): Promise<{ processed: number; extracted: number }> {
  const projectsDir = join(homedir(), '.claude', 'projects');
  const processedPath = join(baseDir, 'capture-log.json');
  const statePath = join(baseDir, 'state.json');
  const indexPath = join(baseDir, 'index.json');
  const knowledgeDir = join(baseDir, 'knowledge');
  const configPath = join(baseDir, 'config.json');

  const config = await loadConfig(configPath);
  const processed = await loadProcessed(processedPath);
  const unprocessed = await findUnprocessedTranscripts(projectsDir, processed);
  const total = unprocessed.length;

  await writeCaptureSync(statePath, 0, total);

  const concurrency = config.knowledge.extraction.captureConcurrency;
  let current = 0;
  let extracted = 0;

  for (let i = 0; i < unprocessed.length; i += concurrency) {
    const batch = unprocessed.slice(i, i + concurrency);
    await Promise.all(batch.map(async (transcriptPath) => {
      try {
        extracted += await handleTranscriptBootstrap(transcriptPath, configPath, indexPath, knowledgeDir, processedPath);
      } catch (err) { process.stderr.write(`[openarche] transcript error: ${String(err)}\n`); }

      current++;
      onProgress(current, total);
      await writeCaptureSync(statePath, current, total);
    }));
  }

  await markBootstrapComplete(statePath, indexPath);

  return { processed: current, extracted };
}

async function main(): Promise<void> {
  const baseDir = join(homedir(), '.claude', 'openarche');
  const result = await runBootstrap(baseDir, (current, total) => {
    process.stderr.write(`\rBootstrap progress: ${current}/${total}`);
  });
  process.stderr.write(`\nBootstrap complete: processed ${result.processed} transcripts, extracted ${result.extracted} knowledge items.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err) + '\n'));
}
