export interface ArcheEntry {
  id: string;
  title: string;
  type: 'solution' | 'decision' | 'pattern' | 'gotcha';
  structure: 'atomic' | 'linear' | 'tree' | 'graph';
  tags: string[];
  links: string[];
  score: number;
  access_count: number;
  source_project: string | null;
  trigger_context: string;
  quality: number;
  quality_breakdown: { reusability: number; non_obviousness: number; clarity: number; completeness: number };
  created_at: number;
  last_accessed: number | null;
  /** float32 vector, length matches embedding model (384 for multilingual-e5-small, 1536 for text-embedding-3-small) */
  embedding: number[];
}

export interface ArcheIndex {
  version: 1;
  memories: ArcheEntry[];
}

export interface AppConfig {
  embedding: {
    provider: 'local' | 'openai' | 'voyage';
    localModel: string;
    remoteProvider?: string;
    remoteModel?: string;
    remoteApiKey?: string;
  };
  retrieval: {
    threshold: number;
    topK: number;
    maxInjectChars: number;
  };
  extraction: {
    model: string;
    minQualityScore: number;
    bootstrapConcurrency: number;
  };
}

export interface AppState {
  totalMemories: number;
  lastMatch: { count: number; at: number; titles: string[] } | null;
  bootstrapping: { current: number; total: number };
}

export interface StdinData {
  prompt?: string;
  transcript_path?: string;
  cwd?: string;
  model?: { id?: string; display_name?: string };
  context_window?: {
    context_window_size?: number;
    used_percentage?: number;
    current_usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}
