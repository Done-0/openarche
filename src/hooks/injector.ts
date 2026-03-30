import type { SearchResult } from '../engine/search.js';

export function formatInjectXml(
  results: SearchResult[],
  totalMemories: number,
  getBody: (id: string) => string
): string {
  const bodies = results.map(r => {
    const body = getBody(r.entry.id);
    const ageDays = Math.floor((Date.now() - r.entry.created_at) / 86400000);
    return `  <memory id="${r.entry.id}" type="${r.entry.type}" structure="${r.entry.structure}" score="${r.entry.score.toFixed(1)}" age="${ageDays}d" project="${r.entry.source_project ?? 'general'}" via="${r.via}">\n${body}\n  </memory>`;
  });
  return `<arche_context matched="${results.length}" total="${totalMemories}">\n${bodies.join('\n')}\n</arche_context>`;
}
