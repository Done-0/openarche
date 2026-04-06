import type { SearchResult } from '../knowledge/search.js';

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function formatContextXml(
  results: SearchResult[],
  totalEntries: number,
  getBody: (id: string) => string
): string {
  return `<openarche_knowledge matched="${results.length}" total="${totalEntries}">\n${results.map(result => {
    const body = escapeXml(getBody(result.entry.id));
    const ageDays = Math.floor((Date.now() - result.entry.created_at) / 86400000);
    return `  <knowledge id="${escapeXml(result.entry.id)}" type="${escapeXml(result.entry.type)}" structure="${escapeXml(result.entry.structure)}" score="${result.entry.score.toFixed(1)}" age="${ageDays}d" project="${escapeXml(result.entry.source_project ?? 'general')}" via="${escapeXml(result.via)}">\n${body}\n  </knowledge>`;
  }).join('\n')}\n</openarche_knowledge>`;
}
