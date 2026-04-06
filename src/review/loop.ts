import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { ReviewProtocol } from '../contracts.js';
import type { ReviewLoopSpec } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createReviewLoopSpec(config: ProductConfig): ReviewLoopSpec {
  if (!config.review.localSelfReview && !config.review.localAgentReview && !config.review.cloudAgentReview) {
    throw new Error('At least one review path must be enabled');
  }
  if (!Number.isInteger(config.review.repairLoops) || config.review.repairLoops < 1) {
    throw new Error('repairLoops must be an integer greater than or equal to 1');
  }
  return {
    localSelfReview: config.review.localSelfReview,
    localAgentReview: config.review.localAgentReview,
    cloudAgentReview: config.review.cloudAgentReview,
    repairLoops: config.review.repairLoops,
    respondToFeedback: true,
    iterateUntilSatisfied: true,
    detectBuildFailures: true,
    remediateBuildFailures: true,
    escalateWhenJudgmentRequired: true,
    mergeWhenSatisfied: true,
    mergeChecks: [
      { id: 'validation', description: 'Validation evidence is attached and passes.', status: 'pending' },
      { id: 'self-review', description: 'Local self-review is complete when enabled.', status: config.review.localSelfReview ? 'pending' : 'not_applicable' },
      { id: 'local-agent-review', description: 'Local agent review is complete when enabled.', status: config.review.localAgentReview ? 'pending' : 'not_applicable' },
      { id: 'cloud-agent-review', description: 'Cloud agent review is complete when enabled.', status: config.review.cloudAgentReview ? 'pending' : 'not_applicable' },
      { id: 'feedback', description: 'Review findings are resolved or explicitly accepted.', status: 'pending' },
      { id: 'build', description: 'Build failures are fixed before merge.', status: 'pending' },
      { id: 'judgment', description: 'Judgment calls are escalated only when needed.', status: 'pending' },
    ],
    blockers: [
      ...(config.review.localSelfReview ? ['Local self-review has not been completed.'] : []),
      ...(config.review.localAgentReview ? ['Local agent review has not been completed.'] : []),
      ...(config.review.cloudAgentReview ? ['Cloud agent review has not been completed.'] : []),
      'Review feedback has not been resolved.',
      'Build failure remediation has not been confirmed.',
    ],
    state: {
      localSelfReviewCompleted: config.review.localSelfReview ? 'pending' : 'not_applicable',
      localAgentReviewCompleted: config.review.localAgentReview ? 'pending' : 'not_applicable',
      cloudAgentReviewCompleted: config.review.cloudAgentReview ? 'pending' : 'not_applicable',
      feedbackResolved: 'pending',
      buildFailuresResolved: 'pending',
      judgmentRequired: false,
      judgmentEscalated: 'not_applicable',
      mergeReady: false,
    },
    ready: false,
  };
}

export function discoverMechanicalChecks(repoRoot: string): ReviewProtocol['checks'] {
  const checks: ReviewProtocol['checks'] = [];
  const packageJsonPath = join(repoRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
      if (packageJson.scripts?.build) {
        checks.push({ id: 'build', kind: 'build', label: 'Build', command: 'npm run build', status: 'pending', exitCode: null, outputPath: null, summary: 'Build check has not run yet.', recordedAt: null });
      }
      if (packageJson.scripts?.lint) {
        checks.push({ id: 'lint', kind: 'lint', label: 'Lint', command: 'npm run lint', status: 'pending', exitCode: null, outputPath: null, summary: 'Lint check has not run yet.', recordedAt: null });
      }
      if (packageJson.scripts?.test) {
        checks.push({ id: 'test', kind: 'test', label: 'Test', command: 'npm test', status: 'pending', exitCode: null, outputPath: null, summary: 'Test check has not run yet.', recordedAt: null });
      }
      if (packageJson.scripts?.typecheck) {
        checks.push({ id: 'typecheck', kind: 'typecheck', label: 'Typecheck', command: 'npm run typecheck', status: 'pending', exitCode: null, outputPath: null, summary: 'Typecheck has not run yet.', recordedAt: null });
      }
    } catch {
      checks.push({ id: 'package-json-invalid', kind: 'custom', label: 'Package manifest', command: 'package.json parse', status: 'failed', exitCode: null, outputPath: null, summary: 'package.json could not be parsed for automatic review discovery.', recordedAt: Date.now() });
    }
  }
  if (existsSync(join(repoRoot, 'Cargo.toml'))) {
    if (!checks.some(check => check.kind === 'build')) checks.push({ id: 'cargo-build', kind: 'build', label: 'Cargo build', command: 'cargo build', status: 'pending', exitCode: null, outputPath: null, summary: 'Cargo build has not run yet.', recordedAt: null });
    if (!checks.some(check => check.kind === 'test')) checks.push({ id: 'cargo-test', kind: 'test', label: 'Cargo test', command: 'cargo test', status: 'pending', exitCode: null, outputPath: null, summary: 'Cargo test has not run yet.', recordedAt: null });
    if (!checks.some(check => check.kind === 'lint')) checks.push({ id: 'cargo-clippy', kind: 'lint', label: 'Cargo clippy', command: 'cargo clippy --all-targets --all-features', status: 'pending', exitCode: null, outputPath: null, summary: 'Cargo clippy has not run yet.', recordedAt: null });
  }
  if (existsSync(join(repoRoot, 'go.mod'))) {
    if (!checks.some(check => check.kind === 'build')) checks.push({ id: 'go-build', kind: 'build', label: 'Go build', command: 'go build ./...', status: 'pending', exitCode: null, outputPath: null, summary: 'Go build has not run yet.', recordedAt: null });
    if (!checks.some(check => check.kind === 'test')) checks.push({ id: 'go-test', kind: 'test', label: 'Go test', command: 'go test ./...', status: 'pending', exitCode: null, outputPath: null, summary: 'Go test has not run yet.', recordedAt: null });
  }
  if (existsSync(join(repoRoot, 'pyproject.toml')) || existsSync(join(repoRoot, 'pytest.ini'))) {
    if (!checks.some(check => check.kind === 'test')) checks.push({ id: 'pytest', kind: 'test', label: 'Pytest', command: 'python -m pytest', status: 'pending', exitCode: null, outputPath: null, summary: 'Pytest has not run yet.', recordedAt: null });
  }
  if (existsSync(join(repoRoot, 'pyproject.toml')) || existsSync(join(repoRoot, 'ruff.toml'))) {
    if (!checks.some(check => check.kind === 'lint')) checks.push({ id: 'ruff', kind: 'lint', label: 'Ruff', command: 'python -m ruff check .', status: 'pending', exitCode: null, outputPath: null, summary: 'Ruff has not run yet.', recordedAt: null });
  }
  if (existsSync(join(repoRoot, 'pyproject.toml')) || existsSync(join(repoRoot, 'mypy.ini')) || existsSync(join(repoRoot, '.mypy.ini'))) {
    if (!checks.some(check => check.kind === 'typecheck')) checks.push({ id: 'mypy', kind: 'typecheck', label: 'Mypy', command: 'python -m mypy .', status: 'pending', exitCode: null, outputPath: null, summary: 'Mypy has not run yet.', recordedAt: null });
  }
  return checks;
}

export function refreshReviewLoopSpec(spec: ReviewLoopSpec, validationReady: boolean): ReviewLoopSpec {
  spec.mergeChecks = spec.mergeChecks.map(check => {
    if (check.id === 'validation') {
      return { ...check, status: validationReady ? 'passed' : 'failed' };
    }
    if (check.id === 'self-review') {
      return { ...check, status: spec.localSelfReview ? spec.state.localSelfReviewCompleted : 'not_applicable' };
    }
    if (check.id === 'local-agent-review') {
      return { ...check, status: spec.localAgentReview ? spec.state.localAgentReviewCompleted : 'not_applicable' };
    }
    if (check.id === 'cloud-agent-review') {
      return { ...check, status: spec.cloudAgentReview ? spec.state.cloudAgentReviewCompleted : 'not_applicable' };
    }
    if (check.id === 'feedback') {
      return { ...check, status: spec.state.feedbackResolved };
    }
    if (check.id === 'build') {
      return { ...check, status: spec.state.buildFailuresResolved };
    }
    if (check.id === 'judgment') {
      return {
        ...check,
        status: spec.state.judgmentRequired ? spec.state.judgmentEscalated : 'not_applicable',
      };
    }
    return check;
  });
  spec.blockers = spec.mergeChecks.filter(check => check.status === 'pending' || check.status === 'failed').map(check => check.description);
  spec.ready = spec.blockers.length === 0;
  spec.state.mergeReady = spec.ready;
  return spec;
}

export function refreshReviewProtocol(review: ReviewProtocol, validationReady: boolean): ReviewProtocol {
  const actionableChecks = review.checks.filter(check => check.status !== 'not_applicable');
  if (actionableChecks.length === 0 || actionableChecks.every(check => check.status === 'passed')) {
    review.loop.state.buildFailuresResolved = 'passed';
  } else if (actionableChecks.some(check => check.status === 'failed')) {
    review.loop.state.buildFailuresResolved = 'failed';
  } else {
    review.loop.state.buildFailuresResolved = 'pending';
  }
  review.loop = refreshReviewLoopSpec(review.loop, validationReady);
  review.blockers = [
    ...review.loop.blockers,
    ...review.checks
      .filter(check => check.status === 'failed' || check.status === 'pending')
      .map(check => check.summary),
  ];
  return review;
}

export async function collectMechanicalReviewEvidence(
  repoRoot: string,
  review: ReviewProtocol,
  evidenceDir: string
): Promise<ReviewProtocol> {
  await mkdir(evidenceDir, { recursive: true });
  for (const check of review.checks) {
    if (check.status === 'not_applicable') continue;
    const outputPath = join(evidenceDir, `${check.id}.txt`);
    const startedAt = Date.now();
    const result = await new Promise<{ exitCode: number | null; output: string }>((resolve, reject) => {
      const child = spawn('sh', ['-lc', check.command], { cwd: repoRoot, env: process.env });
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, 120000);
      child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
      child.stderr.on('data', chunk => chunks.push(Buffer.from(chunk)));
      child.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', exitCode => {
        clearTimeout(timeout);
        resolve({ exitCode, output: Buffer.concat(chunks).toString('utf8').slice(0, 20000) });
      });
    }).catch(error => ({ exitCode: null, output: error instanceof Error ? error.message : String(error) }));
    await writeFile(outputPath, result.output, 'utf8');
    check.exitCode = result.exitCode;
    check.outputPath = outputPath;
    check.recordedAt = startedAt;
    check.status = result.exitCode === 0 ? 'passed' : 'failed';
    check.summary = result.exitCode === 0
      ? `${check.label} passed.`
      : `${check.label} failed${result.exitCode === null ? '' : ` with exit code ${result.exitCode}`}.`;
  }
  return review;
}

export function recordReviewOutcome(
  spec: ReviewLoopSpec,
  updates: Partial<ReviewLoopSpec['state']>,
  validationReady: boolean
): ReviewLoopSpec {
  spec.state = { ...spec.state, ...updates };
  if (!spec.state.judgmentRequired) {
    spec.state.judgmentEscalated = 'not_applicable';
  } else if (spec.state.judgmentEscalated === 'not_applicable') {
    spec.state.judgmentEscalated = 'pending';
  }
  return refreshReviewLoopSpec(spec, validationReady);
}
