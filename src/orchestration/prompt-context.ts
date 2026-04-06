import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { createProductManifest } from '../product/manifest.js';
import { mutateState } from '../state.js';
import { loadIndex, mutateIndex } from '../knowledge/index-store.js';
import { embed } from '../knowledge/embedding.js';
import { getGlobalKnowledgeStorePaths, getRepoKnowledgeStorePaths } from '../knowledge/paths.js';
import { retrieve } from '../knowledge/search.js';
import { ensureAutoHarnessFlow } from './auto-flow.js';
import { escapeXml, formatContextXml } from './context-xml.js';
import { evaluateHarnessGateWithEmbeddings } from './gates.js';
import { evaluateHarnessPolicy } from './policy.js';
import { evaluateHarnessCompletion, synchronizeHarnessSession } from './session.js';

export interface PromptContextRequest {
  baseDir: string;
  promptText: string;
  cwd?: string;
}

export async function buildPromptContext(request: PromptContextRequest): Promise<string | null> {
  const globalStore = getGlobalKnowledgeStorePaths(request.baseDir);
  const repoStore = request.cwd ? getRepoKnowledgeStorePaths(request.cwd) : null;
  const statePath = join(request.baseDir, 'state.json');
  const configPath = join(request.baseDir, 'config.json');

  const config = await loadConfig(configPath);
  const manifest = createProductManifest('workspace');
  const gate = await evaluateHarnessGateWithEmbeddings(request.promptText, config);
  const policy = await evaluateHarnessPolicy(request.promptText, config, gate);
  const readiness = Number((
    Object.values(manifest.capabilities).reduce((sum, capability) => (
      sum + (
        !capability.enabled ? 0
        : capability.maturity === 'operational' ? 1
        : capability.maturity === 'prototype' ? 0.65
        : 0.35
      )
    ), 0) / Object.values(manifest.capabilities).length
  ).toFixed(2));
  const autoFlow = await ensureAutoHarnessFlow(request.baseDir, request.promptText, request.cwd, { materialize: policy.materialize, decision: policy });
  if (request.cwd && autoFlow?.sessionId) {
    const synchronized = await synchronizeHarnessSession(request.cwd, autoFlow.sessionId);
    if (synchronized) autoFlow.completion = evaluateHarnessCompletion(synchronized);
  }
  const globalIndex = await loadIndex(globalStore.indexPath);
  const repoIndex = repoStore ? await loadIndex(repoStore.indexPath).catch(() => ({ version: 1 as const, entries: [] })) : { version: 1 as const, entries: [] };
  const index = {
    version: 1 as const,
    entries: [...repoIndex.entries, ...globalIndex.entries.filter(entry => !repoIndex.entries.some(repoEntry => repoEntry.id === entry.id))],
  };
  const capabilityXml = Object.values(manifest.capabilities).map(capability =>
    `  <capability name="${escapeXml(capability.name)}" enabled="${capability.enabled}" maturity="${escapeXml(capability.maturity)}" required_for="${escapeXml(capability.requiredFor.join(','))}" evidence_driven="${capability.evidenceDriven}" automated_by_default="${capability.automatedByDefault}">${escapeXml(`${capability.summary} Responsibilities: ${capability.responsibilities.join(' ')}`)}</capability>`
  ).join('\n');
  const workflowXml = [
    '  <step capability="planning">Define the objective, acceptance criteria, and explicit execution steps before large changes.</step>',
    '  <step capability="worktree">Plan an isolated git worktree or branch session for task execution without mutating the default workspace automatically.</step>',
    '  <step capability="browser">Collect browser evidence when UI behavior or user journeys matter.</step>',
    '  <step capability="observability">Inspect logs, metrics, and traces when reliability or performance is part of the task.</step>',
    '  <step capability="review">Run self-review and repair loops before merge.</step>',
    '  <step capability="maintenance">Capture reusable knowledge and clean low-signal drift after delivery.</step>',
  ].join('\n');
  const policyXml = [
    '  <rule>For non-trivial changes, plan before editing.</rule>',
    '  <rule>Keep execution isolated from the default workspace.</rule>',
    '  <rule>Attach validation evidence before considering the task done.</rule>',
    '  <rule>Run review and repair loops before merge.</rule>',
    '  <rule>Capture reusable engineering knowledge after the task.</rule>',
  ].join('\n');
  const gateSummary = gate.required
    ? policy.materialize
      ? `This task is being placed under harness control because ${policy.reasons.join(' ').toLowerCase() || 'it is not safe to treat it as a light task.'}`
      : `OpenArche is injecting harness context without materializing a task session because ${policy.reasons.join(' ').toLowerCase() || 'the task does not yet justify persisted project artifacts.'}`
    : 'This task stays light, so only minimal harness context is injected.';
  const gateXml = [
    `  <gate required="${gate.required}" complexity="${escapeXml(gate.complexity)}" stages="${escapeXml(gate.requiredStages.join(','))}">${escapeXml(gate.reasons.join(' ') || 'Light task; minimal harness stages are sufficient.')}</gate>`,
    `  <policy mode="${escapeXml(autoFlow?.mode ?? 'skip')}" intent="${escapeXml(policy.intent)}" command="${escapeXml(policy.command ?? '')}" materialize="${policy.materialize}">${escapeXml(policy.reasons.join(' ') || 'No additional policy reason was recorded.')}</policy>`,
    `  <impact>${escapeXml(gateSummary)}</impact>`,
    gate.required
      ? policy.materialize
        ? `  <operator_expectation>${escapeXml(`Do not treat this as a one-shot chat task. Keep the remaining stages explicit until ${gate.requiredStages.join(', ')} are either satisfied or intentionally acknowledged.`)}</operator_expectation>`
        : `  <operator_expectation>${escapeXml('Keep the answer grounded, but do not create or assume a persisted harness session unless execution actually starts or the user enters an explicit harness command.')}</operator_expectation>`
      : `  <operator_expectation>${escapeXml('Answer directly, but still keep the work grounded and avoid drifting into uncontrolled complexity.')}</operator_expectation>`,
  ].join('\n');
  const sessionXml = autoFlow?.sessionId
    ? [
        `  <session_summary>${escapeXml(
          autoFlow.completion?.ready
            ? 'OpenArche has already closed all required gates for this task.'
            : `OpenArche is preventing this task from closing before ${autoFlow.completion?.incompleteStages.join(', ') || 'the remaining required stages'} are explicit.`
        )}</session_summary>`,
        `  <session id="${escapeXml(autoFlow.sessionId)}" complexity="${escapeXml(autoFlow.complexity)}" required="${autoFlow.required}">`,
        `    <summary>${escapeXml(autoFlow.completion?.ready ? 'The harness session is closed.' : `The harness session is active. Remaining stages: ${autoFlow.completion?.incompleteStages.join(', ') || 'unknown'}.`)}</summary>`,
        `    <completion ready="${autoFlow.completion?.ready ?? false}" incomplete="${escapeXml(autoFlow.completion?.incompleteStages.join(',') ?? '')}" completed="${escapeXml(autoFlow.completion?.completedStages.join(',') ?? '')}">${escapeXml(autoFlow.completion?.summary ?? 'Harness session exists but completion state is unavailable.')}</completion>`,
        ...(autoFlow.warnings.length > 0 ? autoFlow.warnings.map(warning => `    <warning>${escapeXml(warning)}</warning>`) : []),
        '  </session>',
      ].join('\n')
    : `  <session active="false">${escapeXml(
      gate.required && policy.inject
        ? 'Harness context is active, but project artifacts are deferred until execution begins.'
        : 'No active harness session is required for this prompt.'
    )}</session>`;
  const baseContext = `<openarche_context>\n<capabilities readiness="${readiness.toFixed(2)}">\n${capabilityXml}\n</capabilities>\n<harness_policy mode="required">\n${policyXml}\n${gateXml}\n${sessionXml}\n</harness_policy>\n<workflow>\n${workflowXml}\n</workflow>\n</openarche_context>`;

  await mutateState(statePath, state => {
    state.activeSession = autoFlow?.sessionId && autoFlow.completion
      ? {
          id: autoFlow.sessionId,
          complexity: autoFlow.complexity,
          incompleteStages: autoFlow.completion.incompleteStages,
          summary: autoFlow.completion.ready ? 'All required harness gates are closed.' : `Harness opened. Remaining stages: ${autoFlow.completion.incompleteStages.join(', ')}.`,
          updatedAt: Date.now(),
        }
      : null;
  });
  if (index.entries.length === 0) return baseContext;

  let results;
  try {
    const queryEmbedding = await embed(request.promptText, config);
    results = await Promise.resolve(retrieve(index, queryEmbedding, config.knowledge.retrieval.threshold, config.knowledge.retrieval.topK, request.cwd));
  } catch {
    return baseContext;
  }
  if (results.length === 0) return baseContext;

  const bodyMap = new Map<string, string>();
  const knowledgeDirById = new Map<string, string>();
  for (const entry of repoIndex.entries) {
    if (repoStore) knowledgeDirById.set(entry.id, repoStore.knowledgeDir);
  }
  for (const entry of globalIndex.entries) {
    if (!knowledgeDirById.has(entry.id)) knowledgeDirById.set(entry.id, globalStore.knowledgeDir);
  }
  let totalChars = 0;
  for (const result of results) {
    try {
      const body = await readFile(join(knowledgeDirById.get(result.entry.id) ?? globalStore.knowledgeDir, `${result.entry.id}.md`), 'utf8');
      const bodyOnly = body.split('---\n').slice(2).join('---\n').trim();
      if (totalChars + bodyOnly.length > config.knowledge.retrieval.maxInjectChars) break;
      bodyMap.set(result.entry.id, bodyOnly);
      totalChars += bodyOnly.length;
    } catch {
      continue;
    }
  }

  const filtered = results.filter(result => bodyMap.has(result.entry.id));
  if (filtered.length === 0) return baseContext;

  await mutateState(statePath, state => {
    state.lastRecall = { count: filtered.length, at: Date.now(), titles: filtered.map(result => result.entry.title) };
  });

  const now = Date.now();
  if (repoStore && filtered.some(result => repoIndex.entries.some(entry => entry.id === result.entry.id))) {
    await mutateIndex(repoStore.indexPath, freshIndex => {
      for (const result of filtered) {
        const entryIndex = freshIndex.entries.findIndex(entry => entry.id === result.entry.id);
        if (entryIndex >= 0) {
          freshIndex.entries[entryIndex].access_count += 1;
          freshIndex.entries[entryIndex].last_accessed = now;
          freshIndex.entries[entryIndex].score = Math.min(5.0, freshIndex.entries[entryIndex].score + 0.1);
        }
      }
    });
  }
  await mutateIndex(globalStore.indexPath, freshIndex => {
    for (const result of filtered) {
      const entryIndex = freshIndex.entries.findIndex(entry => entry.id === result.entry.id);
      if (entryIndex >= 0) {
        freshIndex.entries[entryIndex].access_count += 1;
        freshIndex.entries[entryIndex].last_accessed = now;
        freshIndex.entries[entryIndex].score = Math.min(5.0, freshIndex.entries[entryIndex].score + 0.1);
      }
    }
  });

  const knowledgeXml = formatContextXml(filtered, index.entries.length, id => bodyMap.get(id) ?? '');
  return `<openarche_context>\n<capabilities readiness="${readiness.toFixed(2)}">\n${capabilityXml}\n</capabilities>\n<harness_policy mode="required">\n${policyXml}\n${gateXml}\n${sessionXml}\n</harness_policy>\n<workflow>\n${workflowXml}\n</workflow>\n${knowledgeXml}\n</openarche_context>`;
}
