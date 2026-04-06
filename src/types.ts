export interface KnowledgeEntry {
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
  embedding: number[];
}

export interface KnowledgeIndex {
  version: 1;
  entries: KnowledgeEntry[];
}

export interface ProductConfig {
  orchestration: {
    autoInject: boolean;
    persistAfterFirstToolUse: boolean;
    readOnlyCommands: string[];
    explicitSessionCommands: string[];
    injectOnlyIntentThreshold: number;
    materializeIntentThreshold: number;
  };
  knowledge: {
    embedding:
      | {
          provider: 'local';
          localModel: string;
        }
      | {
          provider: 'remote';
          remoteModel: string;
          remoteApiKey: string;
          remoteBaseUrl: string;
        };
    retrieval: {
      threshold: number;
      topK: number;
      maxInjectChars: number;
    };
    extraction: {
      model: string;
      minQualityScore: number;
      captureConcurrency: number;
    };
  };
  execution: {
    isolationStrategy: 'git-worktree' | 'git-branch';
    baseRef: string;
  };
  validation: {
    browser: {
      enabled: boolean;
      captureDomSnapshot: boolean;
      captureScreenshot: boolean;
      captureNavigation: boolean;
    };
  };
  observability: {
    enabled: boolean;
    logs: boolean;
    metrics: boolean;
    traces: boolean;
  };
  review: {
    localSelfReview: boolean;
    localAgentReview: boolean;
    cloudAgentReview: boolean;
    repairLoops: number;
  };
  maintenance: {
    qualitySweep: boolean;
    driftSweep: boolean;
  };
}

export interface AppState {
  knowledgeCount: number;
  lastRecall: { count: number; at: number; titles: string[] } | null;
  captureSync: { current: number; total: number };
  activeSession: {
    id: string;
    complexity: 'light' | 'moderate' | 'high';
    incompleteStages: Array<'plan' | 'execute' | 'validate' | 'observe' | 'review' | 'maintain'>;
    summary: string;
    updatedAt: number;
  } | null;
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
