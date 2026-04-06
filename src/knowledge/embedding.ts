import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProductConfig } from '../types.js';

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
let _pipelineModel = '';

async function getLocalPipeline(modelName: string): Promise<(text: string) => Promise<number[]>> {
  if (_pipeline && _pipelineModel === modelName) return _pipeline;
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = join(homedir(), '.claude', 'openarche', 'models');
  const extractor = await pipeline('feature-extraction', modelName, { quantized: true });
  _pipelineModel = modelName;
  _pipeline = async (text: string) => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
  return _pipeline;
}

async function embedRemote(text: string, config: ProductConfig): Promise<number[]> {
  if (config.knowledge.embedding.provider !== 'remote') {
    throw new Error('Remote embedding config is required for remote embedding');
  }
  const { remoteApiKey, remoteModel, remoteBaseUrl } = config.knowledge.embedding;

  const baseUrl = remoteBaseUrl.replace(/\/$/, '');
  const resp = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${remoteApiKey}`,
    },
    body: JSON.stringify({ input: text, model: remoteModel }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Embedding API error: ${resp.status} ${resp.statusText} - ${errorText}`);
  }

  const json = await resp.json() as { data?: Array<{ embedding?: number[] }>; error?: { message: string } };

  if (json.error) {
    throw new Error(`Embedding API error: ${json.error.message}`);
  }

  if (!json.data || json.data.length === 0 || !json.data[0].embedding) {
    throw new Error('Embedding API returned invalid response');
  }

  return json.data[0].embedding;
}

export async function embed(text: string, config: ProductConfig): Promise<number[]> {
  if (config.knowledge.embedding.provider === 'local') {
    const pipeline = await getLocalPipeline(config.knowledge.embedding.localModel);
    return pipeline(text);
  }
  return embedRemote(text, config);
}
