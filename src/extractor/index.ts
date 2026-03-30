import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
    // Extract JSON array even if response has surrounding prose or markdown fences
    const match = raw.match(/\[\s*\{[\s\S]*\]|\[\s*\]/);
    const jsonStr = match ? match[0] : raw.trim();
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return parsed as ExtractionCandidate[];
  } catch {
    return [];
  }
}

export function isValidCandidate(c: ExtractionCandidate, minQuality: number): boolean {
  return c.quality >= minQuality;
}

const MAX_TRANSCRIPT_CHARS = 40000;

export async function callHaiku(transcript: string, config: AppConfig): Promise<string> {
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is not set');
  const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
  // Parse JSONL and extract readable conversation text
  const readable: string[] = [];
  for (const line of transcript.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type === 'file-history-snapshot' || entry.type === 'summaries') continue;
      const msg = entry.message as Record<string, unknown> | undefined;
      if (!msg) continue;
      const role = (msg.role as string) ?? '';
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === 'text' && typeof block.text === 'string') {
          readable.push(`${role}: ${block.text.slice(0, 2000)}`);
        } else if (block.type === 'tool_use' && typeof block.name === 'string') {
          readable.push(`${role} [tool: ${block.name}]`);
        } else if (block.type === 'tool_result') {
          const c = block.content;
          const text = Array.isArray(c) ? (c as Record<string,unknown>[]).filter(x => x.type==='text').map(x => String(x.text ?? '')).join(' ').slice(0, 500) : '';
          if (text) readable.push(`tool_result: ${text}`);
        }
      }
    } catch { continue; }
  }
  const joined = readable.join('\n');
  let truncated: string;
  if (joined.length > MAX_TRANSCRIPT_CHARS) {
    const mid = Math.floor(joined.length / 2);
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    truncated = joined.slice(Math.max(0, mid - half), mid + half);
  } else {
    truncated = joined;
  }
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
      stream: false,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Extract from this transcript:\n\n${truncated}` }],
    }),
  });
  // Always read via streaming to handle proxies that force SSE regardless of stream:false
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  if (raw.startsWith('event:') || raw.startsWith('data:')) {
    const chunks: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') break;
      try {
        const evt = JSON.parse(data) as { type: string; delta?: { type: string; text: string } };
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') chunks.push(evt.delta.text);
      } catch { continue; }
    }
    if (chunks.length > 0) return chunks.join('');
    throw new Error('SSE stream contained no text content');
  }
  const json = JSON.parse(raw) as { content?: [{ text: string }]; error?: { message: string } };
  if (!resp.ok || !json.content?.[0]?.text) {
    throw new Error(`API error: ${json.error?.message ?? raw.slice(0, 200)}`);
  }
  return json.content[0].text;
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
  if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) return;

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

  let processed: string[] = [];
  try { processed = JSON.parse(await readFile(processedPath, 'utf8')) as string[]; } catch {}
  if (!processed.includes(transcriptPath)) {
    processed.push(transcriptPath);
    await writeFile(processedPath, JSON.stringify(processed, null, 2), 'utf8');
  }
}

if (!process.argv[1]?.includes('.test.')) {
  main().catch(err => process.stderr.write(String(err)));
}
