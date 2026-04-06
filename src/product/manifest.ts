import type { CapabilityDescriptor, CapabilityName, ProductManifest } from '../contracts.js';

export function createProductManifest(version: string): ProductManifest {
  return {
    product: 'openarche',
    version,
    capabilities: {
      planning: {
        name: 'planning' satisfies CapabilityName,
        enabled: true,
        maturity: 'operational' satisfies CapabilityDescriptor['maturity'],
        summary: 'Turn fuzzy intent into execution plans with explicit acceptance criteria.',
        responsibilities: [
          'Translate open-ended goals into explicit execution steps.',
          'Lock acceptance criteria before code changes begin.',
          'Keep task structure small enough for repeated agent execution.',
        ],
        requiredFor: ['moderate', 'high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      worktree: {
        name: 'worktree' satisfies CapabilityName,
        enabled: true,
        maturity: 'operational' satisfies CapabilityDescriptor['maturity'],
        summary: 'Define isolated git worktree or branch sessions for each task.',
        responsibilities: [
          'Isolate non-trivial work from the default workspace.',
          'Bind each harness session to a deterministic execution surface.',
          'Prevent task spillover across concurrent changes.',
        ],
        requiredFor: ['moderate', 'high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      browser: {
        name: 'browser' satisfies CapabilityName,
        enabled: true,
        maturity: 'prototype' satisfies CapabilityDescriptor['maturity'],
        summary: 'Track browser validation evidence and gate completion on required journey proof.',
        responsibilities: [
          'Represent user journeys that must be reproduced and revalidated.',
          'Require browser-facing evidence when UI behavior matters.',
          'Prevent UI fixes from closing without explicit journey proof.',
        ],
        requiredFor: ['high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      observability: {
        name: 'observability' satisfies CapabilityName,
        enabled: true,
        maturity: 'prototype' satisfies CapabilityDescriptor['maturity'],
        summary: 'Track logs, metrics, and traces as required validation evidence.',
        responsibilities: [
          'Represent runtime checks for reliability and performance work.',
          'Require logs, metrics, or traces when runtime behavior is in scope.',
          'Keep production-facing tasks from closing on code inspection alone.',
        ],
        requiredFor: ['high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      review: {
        name: 'review' satisfies CapabilityName,
        enabled: true,
        maturity: 'operational' satisfies CapabilityDescriptor['maturity'],
        summary: 'Run mechanical review gates with repair-loop state before merge.',
        responsibilities: [
          'Track self-review, agent-review, feedback, and build-fix state.',
          'Block completion until enabled review paths are satisfied.',
          'Expose unresolved judgment calls instead of silently accepting them.',
        ],
        requiredFor: ['moderate', 'high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      maintenance: {
        name: 'maintenance' satisfies CapabilityName,
        enabled: true,
        maturity: 'operational' satisfies CapabilityDescriptor['maturity'],
        summary: 'Close out tasks with knowledge capture and recorded follow-up cleanup.',
        responsibilities: [
          'Capture reusable knowledge after task stop.',
          'Record cleanup and follow-up work instead of leaving implicit debt.',
          'Keep harness sessions closed through explicit maintenance state.',
        ],
        requiredFor: ['high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
      knowledge: {
        name: 'knowledge' satisfies CapabilityName,
        enabled: true,
        maturity: 'operational' satisfies CapabilityDescriptor['maturity'],
        summary: 'Capture and retrieve durable engineering knowledge from prior work.',
        responsibilities: [
          'Recall durable local knowledge into active tasks.',
          'Persist high-signal engineering knowledge from completed work.',
          'Keep harness context grounded in repository-local memory.',
        ],
        requiredFor: ['moderate', 'high'],
        evidenceDriven: true,
        automatedByDefault: true,
      },
    },
  };
}
