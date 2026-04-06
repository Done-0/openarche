import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { mutateState } from '../state.js';
import { loadIndex, mutateIndex } from './index-store.js';
import { embed, cosineSimilarity } from './embedding.js';
import { buildLinks, matchLinksHints } from './graph.js';
import { EXTRACTION_SYSTEM_PROMPT } from './extraction-prompt.js';
import { createTranscriptFingerprint, markCaptureLogEntry } from './capture-log.js';
import { getGlobalKnowledgeStorePaths, getRepoKnowledgeStorePaths } from './paths.js';
import type { KnowledgeEntry, ProductConfig } from '../types.js';

export interface ExtractionCandidate {
  title: string;
  type: 'solution' | 'decision' | 'pattern' | 'gotcha';
  structure: 'atomic' | 'linear' | 'tree' | 'graph';
  trigger_context: string;
  body: string;
  tags: string[];
  links_hint: string[];
  quality_breakdown: { reusability: number; non_obviousness: number; clarity: number; completeness: number };
}

export interface TempPayload {
  transcriptPath: string;
  transcript: string;
  cwd: string;
  baseDir: string;
  processedPath: string;
  repoRoot?: string;
  sessionId?: string;
  closeoutEntry?: string;
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
  return (c.quality_breakdown.reusability * 0.4 + c.quality_breakdown.non_obviousness * 0.3 + c.quality_breakdown.clarity * 0.2 + c.quality_breakdown.completeness * 0.1) >= minQuality;
}

const MAX_TRANSCRIPT_CHARS = 40000;

export async function callHaiku(transcript: string, config: ProductConfig): Promise<string> {
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
      model: config.knowledge.extraction.model,
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
  try {
    await unlink(tmpFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  await extractKnowledgeFromPayload(payload);
}

export async function extractKnowledgeFromPayload(payload: TempPayload): Promise<{ status: 'captured' | 'not_applicable'; extracted: number }> {
  const { transcriptPath, transcript, cwd, baseDir, processedPath } = payload;
  const configPath = join(baseDir, 'config.json');
  const statePath = join(baseDir, 'state.json');
  const store = payload.repoRoot ? getRepoKnowledgeStorePaths(payload.repoRoot) : getGlobalKnowledgeStorePaths(baseDir);
  const globalStore = getGlobalKnowledgeStorePaths(baseDir);

  const config = await loadConfig(configPath);
  if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    return { status: 'not_applicable', extracted: 0 };
  }

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
    await mutateIndex(store.indexPath, async index => {
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
        source_project: cwd || null,
        trigger_context: normalizedTriggerContext,
        quality: (c.quality_breakdown.reusability * 0.4 + c.quality_breakdown.non_obviousness * 0.3 + c.quality_breakdown.clarity * 0.2 + c.quality_breakdown.completeness * 0.1),
        quality_breakdown: c.quality_breakdown,
        created_at: bestSim >= 0.85 && similar ? similar.created_at : Date.now(),
        last_accessed: bestSim >= 0.85 && similar ? similar.last_accessed : null,
        embedding: titleEmbedding,
      };
      await mkdir(store.knowledgeDir, { recursive: true });
      await writeFile(join(store.knowledgeDir, `${persistedId}.md`), [
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
    extracted++;

    if (c.links_hint.length > 0) {
      const hintEmbeddings = await Promise.all(
        c.links_hint.map(h => embed(h, config))
      );
      await mutateIndex(store.indexPath, freshIndex => {
        const linkedIds = matchLinksHints(freshIndex, hintEmbeddings, 0.80);
        buildLinks(freshIndex, linkedSourceId, linkedIds.filter(lid => lid !== linkedSourceId));
      });
    }
  }

  await mutateState(statePath, async state => {
    state.knowledgeCount = (await loadIndex(globalStore.indexPath)).entries.length;
  });
  await markCaptureLogEntry(processedPath, createTranscriptFingerprint(transcriptPath));
  return { status: 'captured', extracted };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
