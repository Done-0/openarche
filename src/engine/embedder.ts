import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AppConfig } from '../types.js';

export function normalizeVector(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return v;
  return v.map(x => x / mag);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const na = normalizeVector(a);
  const nb = normalizeVector(b);
  return na.reduce((s, x, i) => s + x * (nb[i] ?? 0), 0);
}

let _pipeline: ((text: string) => Promise<number[]>) | null = null;

async function getLocalPipeline(modelName: string): Promise<(text: string) => Promise<number[]>> {
  if (_pipeline) return _pipeline;
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = join(homedir(), '.claude', 'openarche', 'models');
  const extractor = await pipeline('feature-extraction', modelName, { quantized: true });
  _pipeline = async (text: string) => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
  return _pipeline;
}

async function embedRemote(text: string, config: AppConfig): Promise<number[]> {
  const { remoteProvider, remoteApiKey, remoteModel } = config.embedding;
  if (remoteProvider === 'openai' || remoteProvider === 'siliconflow') {
    const baseUrl = remoteProvider === 'siliconflow'
      ? 'https://api.siliconflow.cn/v1/embeddings'
      : 'https://api.openai.com/v1/embeddings';
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${remoteApiKey}`,
      },
      body: JSON.stringify({ input: text, model: remoteModel }),
    });
    const json = await resp.json() as { data: [{ embedding: number[] }] };
    return json.data[0].embedding;
  }
  throw new Error(`Unsupported remote provider: ${remoteProvider}`);
}

export async function embed(text: string, config: AppConfig): Promise<number[]> {
  if (config.embedding.provider === 'local') {
    const pipeline = await getLocalPipeline(config.embedding.localModel);
    return pipeline(text);
  }
  return embedRemote(text, config);
}
