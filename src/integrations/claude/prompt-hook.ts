import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPromptContext } from '../../orchestration/prompt-context.js';
import type { StdinData } from '../../types.js';

const BASE_DIR = join(homedir(), '.claude', 'openarche');

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
      } catch {
        continue;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
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

  const xml = await buildPromptContext({ baseDir: BASE_DIR, promptText, cwd: stdin.cwd });
  if (!xml) return;
  process.stdout.write(xml);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => process.stderr.write(String(err)));
}
