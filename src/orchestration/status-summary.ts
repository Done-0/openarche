import type { AppState } from '../types.js';

const RECENT_MATCH_MS = 10 * 60 * 1000;

export function renderStatusSummary(state: AppState): string {
  if (state.captureSync.total > 0) {
    return `◉ Arche: knowledge sync ${state.captureSync.current}/${state.captureSync.total}...`;
  }
  if (state.activeSession && Date.now() - state.activeSession.updatedAt < RECENT_MATCH_MS) {
    const summary = state.activeSession.summary.length > 44
      ? `${state.activeSession.summary.slice(0, 43)}…`
      : state.activeSession.summary;
    const open = state.activeSession.incompleteStages.slice(0, 3).join(', ');
    const more = state.activeSession.incompleteStages.length > 3 ? ` +${state.activeSession.incompleteStages.length - 3}` : '';
    if (state.activeSession.incompleteStages.length === 0) {
      return `◉ Arche: ${state.activeSession.complexity} harness · ${summary}`;
    }
    return `◉ Arche: ${state.activeSession.complexity} harness · ${state.activeSession.incompleteStages.length} open · ${open}${more} · ${summary}`;
  }
  if (state.knowledgeCount === 0) {
    return '○ Arche: harness ready · no local knowledge yet';
  }
  const base = `◉ Arche: ${state.knowledgeCount} knowledge`;
  if (state.lastRecall && Date.now() - state.lastRecall.at < RECENT_MATCH_MS) {
    const mins = Math.round((Date.now() - state.lastRecall.at) / 60000);
    const ago = mins < 1 ? '<1m ago' : `${mins}m ago`;
    const prefix = `◉ Arche: ${state.knowledgeCount} knowledge · Recalled: `;
    const suffix = ` · ${ago}`;
    const budget = 35;
    let label = '';
    for (const title of state.lastRecall.titles) {
      const short = title.length > 15 ? `${title.slice(0, 14)}…` : title;
      const next = label ? `${label}, ${short}` : short;
      if (next.length > budget) break;
      label = next;
    }
    return `${prefix}${label}${suffix}`;
  }
  return base;
}
