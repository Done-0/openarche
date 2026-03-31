import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StdinData } from '../types.js';

const BASE_DIR = join(homedir(), '.claude', 'openarche');
const PROCESSED_PATH = join(BASE_DIR, 'processed.json');
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MIN_USER_TURNS = 5;
const SILENCE_MS = 12 * 60 * 60 * 1000;

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
  const extractorPath = fileURLToPath(new URL('../extractor/index.js', import.meta.url));

  let projects: string[] = [];
  try {
    projects = (await readdir(PROJECTS_DIR, { withFileTypes: true }))
      .filter(e => e.isDirectory())
      .map(e => join(PROJECTS_DIR, e.name));
  } catch { return; }

  for (const projectDir of projects) {
    let files: string[] = [];
    try {
      files = (await readdir(projectDir, { withFileTypes: true }))
        .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
        .map(e => join(projectDir, e.name));
    } catch { continue; }

    for (const filePath of files) {
      if (processed.has(filePath)) continue;

      const s = await stat(filePath).catch(() => null);
      if (!s || Date.now() - s.mtimeMs < SILENCE_MS) continue;

      let transcript = '';
      try { transcript = await readFile(filePath, 'utf8'); } catch { continue; }

      if (!transcript.includes('"tool_use"')) continue;
      const userTurns = transcript.split('\n').filter(l => {
        try { return (JSON.parse(l) as { message?: { role?: string } }).message?.role === 'user'; } catch { return false; }
      }).length;
      if (userTurns < MIN_USER_TURNS) continue;

      const tmpFile = join(tmpdir(), `openarche-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      await writeFile(tmpFile, JSON.stringify({
        transcriptPath: filePath,
        transcript,
        cwd: '',
        baseDir: BASE_DIR,
        processedPath: PROCESSED_PATH,
      }), 'utf8');

      const child = spawn(process.execPath, [extractorPath, tmpFile], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
    }
  }
}

if (!process.argv[1]?.includes('.test.')) {
  main().catch(err => process.stderr.write(String(err)));
}
