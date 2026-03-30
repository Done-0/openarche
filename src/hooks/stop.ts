import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StdinData } from '../types.js';

const BASE_DIR = join(homedir(), '.claude', 'openarche');
const PROCESSED_PATH = join(BASE_DIR, 'processed.json');

async function loadProcessed(): Promise<Set<string>> {
  try {
    const raw = await readFile(PROCESSED_PATH, 'utf8');
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function main(): Promise<void> {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  const raw = chunks.join('');
  if (!raw.trim()) return;

  const stdin = JSON.parse(raw) as StdinData;
  if (!stdin.transcript_path) return;

  const processed = await loadProcessed();
  if (processed.has(stdin.transcript_path)) return;

  let transcript = '';
  try {
    transcript = await readFile(stdin.transcript_path, 'utf8');
  } catch { return; }

  if (transcript.trim().split('\n').filter(Boolean).length < 4) return;
  if (!transcript.includes('"tool_use"')) return;

  const tmpFile = join(tmpdir(), `openarche-${Date.now()}.json`);
  await writeFile(tmpFile, JSON.stringify({
    transcriptPath: stdin.transcript_path,
    transcript,
    cwd: stdin.cwd ?? '',
    baseDir: BASE_DIR,
    processedPath: PROCESSED_PATH,
  }), 'utf8');

  const extractorPath = fileURLToPath(new URL('../extractor/index.js', import.meta.url));
  const child = spawn(process.execPath, [extractorPath, tmpFile], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

if (!process.argv[1]?.includes('.test.')) {
  main().catch(err => process.stderr.write(String(err)));
}
