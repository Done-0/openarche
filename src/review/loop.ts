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
