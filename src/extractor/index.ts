import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { loadIndex, saveIndex } from '../engine/index-store.js';
import { embed, cosineSimilarity } from '../engine/embedder.js';
import { writeMemory } from '../engine/writer.js';
import { buildLinks, matchLinksHints } from '../engine/graph.js';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt.js';
import type { ArcheEntry, AppConfig } from '../types.js';

export interface ExtractionCandidate {
  title: string;
  type: 'solution' | 'decision' | 'pattern' | 'gotcha';
  structure: 'atomic' | 'linear' | 'tree' | 'graph';
  trigger_context: string;
  body: string;
  tags: string[];
  links_hint: string[];
  quality: number;
}

interface TempPayload {
  transcriptPath: string;
  transcript: string;
  cwd: string;
  baseDir: string;
  processedPath: string;
}

export function parseExtractionResult(raw: string): ExtractionCandidate[] {
  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return parsed as ExtractionCandidate[];
  } catch {
    return [];
  }
}

export function isValidCandidate(c: ExtractionCandidate, minQuality: number): boolean {
  return c.quality >= minQuality;
}

export async function callHaiku(transcript: string, config: AppConfig): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.extraction.model,
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Extract from this transcript:\n\n${transcript}` }],
    }),
  });
  const json = await resp.json() as { content: [{ text: string }] };
  return json.content[0].text;
}

async function markProcessed(processedPath: string, transcriptPath: string): Promise<void> {
  let paths: string[] = [];
  try {
    paths = JSON.parse(await readFile(processedPath, 'utf8')) as string[];
  } catch {}
  if (!paths.includes(transcriptPath)) {
    paths.push(transcriptPath);
    await writeFile(processedPath, JSON.stringify(paths, null, 2), 'utf8');
  }
}

async function main(): Promise<void> {
  const tmpFile = process.argv[2];
  if (!tmpFile) return;

  const payload = JSON.parse(await readFile(tmpFile, 'utf8')) as TempPayload;
  await unlink(tmpFile).catch(() => {});

  const { transcriptPath, transcript, cwd, baseDir, processedPath } = payload;
  const configPath = join(baseDir, 'config.json');
  const indexPath = join(baseDir, 'index.json');
  const statePath = join(baseDir, 'state.json');
  const memoriesDir = join(baseDir, 'memories');

  const config = await loadConfig(configPath);
  if (!process.env.ANTHROPIC_API_KEY) return;

  const raw = await callHaiku(transcript, config);
  const candidates = parseExtractionResult(raw);

  for (const c of candidates) {
    if (!isValidCandidate(c, config.extraction.minQualityScore)) continue;

    const titleEmbedding = await embed(`${c.title} ${c.trigger_context}`, config);

    const currentIndex = await loadIndex(indexPath);
    const isDuplicate = currentIndex.memories.some(e =>
      cosineSimilarity(titleEmbedding, e.embedding) >= 0.95
    );
    if (isDuplicate) continue;

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
      source_project: cwd || null,
      trigger_context: c.trigger_context,
      quality: c.quality,
      created_at: Date.now(),
      last_accessed: null,
      embedding: titleEmbedding,
    };

    await writeMemory({ memoriesDir, indexPath, entry, body: c.body });

    if (c.links_hint.length > 0) {
      const hintEmbeddings = await Promise.all(
        c.links_hint.map(h => embed(h, config))
      );
      const lockPath = indexPath + '.lock';
      let waited = 0;
      const { existsSync } = await import('node:fs');
      while (existsSync(lockPath) && waited < 3000) {
        await new Promise(r => setTimeout(r, 50));
        waited += 50;
      }
      await writeFile(lockPath, '', 'utf8');
      try {
        const freshIndex = await loadIndex(indexPath);
        const linkedIds = matchLinksHints(freshIndex, hintEmbeddings, 0.80);
        buildLinks(freshIndex, id, linkedIds.filter(lid => lid !== id));
        await saveIndex(indexPath, freshIndex);
      } finally {
        await unlink(lockPath).catch(() => {});
      }
    }
  }

  const state = await loadState(statePath);
  state.totalMemories = (await loadIndex(indexPath)).memories.length;
  await saveState(statePath, state);

  await markProcessed(processedPath, transcriptPath);
}

if (!process.argv[1]?.includes('.test.')) {
  main().catch(err => process.stderr.write(String(err)));
}
