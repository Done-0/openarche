import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from '../config.js';
import { loadState, saveState } from '../state.js';
import { loadIndex, saveIndex } from '../engine/index-store.js';
import { embed } from '../engine/embedder.js';
import { retrieve } from '../engine/search.js';
import { formatInjectXml } from './injector.js';
import type { StdinData } from '../types.js';

const BASE_DIR = join(homedir(), '.claude', 'openarche');
const INDEX_PATH = join(BASE_DIR, 'index.json');
const STATE_PATH = join(BASE_DIR, 'state.json');
const CONFIG_PATH = join(BASE_DIR, 'config.json');
const MEMORIES_DIR = join(BASE_DIR, 'memories');

export async function getLastHumanMessage(transcriptPath: string): Promise<string | null> {
  try {
    const raw = await readFile(transcriptPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown } };
        if (entry.message?.role === 'user') {
          const content = entry.message.content;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            const text = content.find((b: { type?: string }) => b.type === 'text') as { text?: string } | undefined;
            return text?.text ?? null;
          }
        }
      } catch { continue; }
    }
  } catch {}
  return null;
}

async function main(): Promise<void> {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  const raw = chunks.join('');
  if (!raw.trim()) return;

  const stdin = JSON.parse(raw) as StdinData;
  if (!stdin.transcript_path) return;

  const promptText = stdin.prompt ?? await getLastHumanMessage(stdin.transcript_path);
  if (!promptText || promptText.length < 10) return;

  const config = await loadConfig(CONFIG_PATH);
  const index = await loadIndex(INDEX_PATH);
  if (index.memories.length === 0) return;

  const queryEmbedding = await embed(promptText, config);
  const results = retrieve(index, queryEmbedding, config.retrieval.threshold, config.retrieval.topK, stdin.cwd);
  if (results.length === 0) return;

  const bodyMap = new Map<string, string>();
  let totalChars = 0;
  for (const r of results) {
    try {
      const body = await readFile(join(MEMORIES_DIR, `${r.entry.id}.md`), 'utf8');
      const bodyOnly = body.split('---\n').slice(2).join('---\n').trim();
      if (totalChars + bodyOnly.length > config.retrieval.maxInjectChars) break;
      bodyMap.set(r.entry.id, bodyOnly);
      totalChars += bodyOnly.length;
    } catch { continue; }
  }

  const filtered = results.filter(r => bodyMap.has(r.entry.id));
  if (filtered.length === 0) return;

  const xml = formatInjectXml(filtered, index.memories.length, id => bodyMap.get(id) ?? '');
  process.stdout.write(xml);

  const state = await loadState(STATE_PATH);
  state.lastMatch = { count: filtered.length, at: Date.now(), titles: filtered.map(r => r.entry.title) };
  await saveState(STATE_PATH, state);

  const now = Date.now();
  const freshIndex = await loadIndex(INDEX_PATH);
  for (const r of filtered) {
    const i = freshIndex.memories.findIndex(e => e.id === r.entry.id);
    if (i >= 0) {
      freshIndex.memories[i].access_count += 1;
      freshIndex.memories[i].last_accessed = now;
      freshIndex.memories[i].score = Math.min(5.0, freshIndex.memories[i].score + 0.1);
    }
  }
  await saveIndex(INDEX_PATH, freshIndex);
}

if (!process.argv[1]?.includes('.test.')) {
  main().catch(err => process.stderr.write(String(err)));
}
