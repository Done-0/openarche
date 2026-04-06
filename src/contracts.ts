export type CapabilityName =
  | 'planning'
  | 'worktree'
  | 'browser'
  | 'observability'
  | 'review'
  | 'maintenance'
  | 'knowledge';

export type CapabilityMaturity = 'planned' | 'prototype' | 'operational';

export interface CapabilityDescriptor {
  name: CapabilityName;
  enabled: boolean;
  maturity: CapabilityMaturity;
  summary: string;
  responsibilities: string[];
  requiredFor: Array<'moderate' | 'high'>;
  evidenceDriven: boolean;
  automatedByDefault: boolean;
}

export interface ProductManifest {
  product: string;
  version: string;
  capabilities: Record<CapabilityName, CapabilityDescriptor>;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface PlanStep {
  id: string;
  title: string;
  capability: CapabilityName;
  outcome: string;
}

export interface ExecutionPlan {
  id: string;
  objective: string;
  acceptanceCriteria: AcceptanceCriterion[];
  steps: PlanStep[];
}

export type HarnessStageName = 'plan' | 'execute' | 'validate' | 'observe' | 'review' | 'maintain';

export interface HarnessStage {
  name: HarnessStageName;
  goal: string;
  automated: boolean;
  required: boolean;
  exitCriteria: string[];
}

export interface WorktreeSessionSpec {
  taskId: string;
  repoRoot: string;
  sessionPath: string;
  baseRef: string;
  isolationStrategy: 'git-worktree' | 'git-branch';
  setupCommands: string[];
  automated: boolean;
}

export interface BrowserJourney {
  name: string;
  route: string[];
  successSignal: string;
}

export type HarnessCheckStatus = 'pending' | 'passed' | 'failed' | 'not_applicable';

export type HarnessEvidenceKind = 'transcript' | 'command' | 'screenshot' | 'dom' | 'log' | 'metric' | 'note';

export interface HarnessEvidence {
  kind: HarnessEvidenceKind;
  summary: string;
  path: string | null;
  recordedAt: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ValidationCheck {
  id: string;
  description: string;
  status: HarnessCheckStatus;
  evidence: HarnessEvidence[];
}

export interface BrowserJourneyState {
  name: string;
  route: string[];
  successSignal: string;
  beforeFixReproduced: HarnessCheckStatus;
  navigationCaptured: HarnessCheckStatus;
  domSnapshotCaptured: HarnessCheckStatus;
  screenshotCaptured: HarnessCheckStatus;
  afterFixValidated: HarnessCheckStatus;
  evidence: HarnessEvidence[];
}

export interface BrowserValidationSpec {
  journeys: BrowserJourneyState[];
  captureDomSnapshot: boolean;
  captureScreenshot: boolean;
  captureNavigation: boolean;
  reproduceBeforeFix: boolean;
  validateAfterFix: boolean;
  ready: boolean;
  blockers: string[];
}

export interface ObservabilitySpec {
  logs: string[];
  metrics: string[];
  traces: string[];
  evidence: HarnessEvidence[];
  ready: boolean;
  blockers: string[];
}

export interface ValidationProtocol {
  automated: boolean;
  acceptanceChecks: ValidationCheck[];
  regressionChecks: ValidationCheck[];
  browser: BrowserValidationSpec | null;
  observability: ObservabilitySpec | null;
  ready: boolean;
  blockers: string[];
}

export interface ReviewMergeCheck {
  id: string;
  description: string;
  status: HarnessCheckStatus;
}

export interface ReviewLoopState {
  localSelfReviewCompleted: HarnessCheckStatus;
  localAgentReviewCompleted: HarnessCheckStatus;
  cloudAgentReviewCompleted: HarnessCheckStatus;
  feedbackResolved: HarnessCheckStatus;
  buildFailuresResolved: HarnessCheckStatus;
  judgmentRequired: boolean;
  judgmentEscalated: HarnessCheckStatus;
  mergeReady: boolean;
}

export interface ReviewLoopSpec {
  localSelfReview: boolean;
  localAgentReview: boolean;
  cloudAgentReview: boolean;
  repairLoops: number;
  respondToFeedback: boolean;
  iterateUntilSatisfied: boolean;
  detectBuildFailures: boolean;
  remediateBuildFailures: boolean;
  escalateWhenJudgmentRequired: boolean;
  mergeWhenSatisfied: boolean;
  mergeChecks: ReviewMergeCheck[];
  blockers: string[];
  state: ReviewLoopState;
  ready: boolean;
}

export interface ReviewProtocol {
  automated: boolean;
  blockers: string[];
  loop: ReviewLoopSpec;
  checks: Array<{
    id: string;
    kind: 'build' | 'lint' | 'test' | 'typecheck' | 'custom';
    label: string;
    command: string;
    status: HarnessCheckStatus;
    exitCode: number | null;
    outputPath: string | null;
    summary: string;
    recordedAt: number | null;
  }>;
}

export interface MaintenanceSpec {
  qualitySweep: boolean;
  driftSweep: boolean;
  cleanupTasks: string[];
  knowledgeCapture: 'pending' | 'queued' | 'captured' | 'failed' | 'not_applicable';
  knowledgeCaptureSummary: string;
  followupsRecorded: boolean;
  ready: boolean;
  blockers: string[];
}

export interface MaintenanceProtocol {
  automated: boolean;
  followups: string[];
  spec: MaintenanceSpec;
}

export interface Runbook {
  plan: ExecutionPlan;
  stages: HarnessStage[];
  worktree: WorktreeSessionSpec;
  validation: ValidationProtocol;
  review: ReviewProtocol;
  maintenance: MaintenanceProtocol;
  automationNotes: string[];
}

export type HarnessComplexity = 'light' | 'moderate' | 'high';

export interface HarnessGate {
  required: boolean;
  complexity: HarnessComplexity;
  reasons: string[];
  requiredStages: HarnessStageName[];
}

export type HarnessStageStatus = 'pending' | 'completed';

export interface HarnessStageState {
  name: HarnessStageName;
  status: HarnessStageStatus;
  updatedAt: number;
  summary: string;
  artifactPaths: string[];
}

export interface HarnessSession {
  version: number;
  id: string;
  objective: string;
  complexity: HarnessComplexity;
  required: boolean;
  requiredStages: HarnessStageName[];
  automatedStages: HarnessStageName[];
  repoRoot: string;
  updatedAt: number;
  archivedAt: number | null;
  archiveReason: 'completed' | 'stale' | null;
  runbook: Runbook;
  stageStates: HarnessStageState[];
}

export interface HarnessCompletion {
  ready: boolean;
  completedStages: HarnessStageName[];
  incompleteStages: HarnessStageName[];
  summary: string;
}
