import { createHash } from 'node:crypto';
import type { AcceptanceCriterion, ExecutionPlan, PlanStep } from '../contracts.js';

export function createExecutionPlan(
  objective: string,
  steps: Omit<PlanStep, 'id'>[],
  acceptanceCriteria: string[]
): ExecutionPlan {
  const normalizedObjective = objective.replace(/\s+/g, ' ').trim();
  const seenCriteria = new Set<string>();
  const normalizedCriteria: AcceptanceCriterion[] = [];
  for (const description of acceptanceCriteria) {
    const value = description.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seenCriteria.has(key)) continue;
    seenCriteria.add(key);
    normalizedCriteria.push({
      id: `ac-${normalizedCriteria.length + 1}`,
      description: value,
    });
  }
  const seenSteps = new Set<string>();
  const normalizedSteps: PlanStep[] = [];
  for (const step of steps) {
    const title = step.title.replace(/\s+/g, ' ').trim();
    const outcome = step.outcome.replace(/\s+/g, ' ').trim();
    if (!title || !outcome) continue;
    const key = `${step.capability}:${title.toLowerCase()}:${outcome.toLowerCase()}`;
    if (seenSteps.has(key)) continue;
    seenSteps.add(key);
    normalizedSteps.push({
      ...step,
      title,
      outcome,
      id: `step-${normalizedSteps.length + 1}`,
    });
  }
  return {
    id: `task-${createHash('sha256').update(normalizedObjective).digest('hex').slice(0, 12)}`,
    objective: normalizedObjective,
    acceptanceCriteria: normalizedCriteria,
    steps: normalizedSteps,
  };
}

export function validateExecutionPlan(plan: ExecutionPlan): string[] {
  const errors: string[] = [];

  if (!plan.objective.trim()) {
    errors.push('Plan objective must not be empty.');
  }
  if (plan.acceptanceCriteria.length === 0) {
    errors.push('Plan must define at least one acceptance criterion.');
  }
  if (plan.steps.length === 0) {
    errors.push('Plan must define at least one execution step.');
  }
  if (new Set(plan.acceptanceCriteria.map(criterion => criterion.description.toLowerCase())).size !== plan.acceptanceCriteria.length) {
    errors.push('Plan acceptance criteria must not contain duplicates.');
  }
  if (new Set(plan.steps.map(step => `${step.capability}:${step.title.toLowerCase()}`)).size !== plan.steps.length) {
    errors.push('Plan steps must not contain duplicate capability/title pairs.');
  }
  if (plan.steps.some(step => !step.title.trim())) {
    errors.push('Plan steps must define a non-empty title.');
  }
  if (plan.steps.some(step => !step.outcome.trim())) {
    errors.push('Plan steps must define a non-empty outcome.');
  }

  return errors;
}
