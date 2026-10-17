/** View-local card facets (Tags). Counts use the full current
 * collection, never the filtered subset; selections inside one facet use OR,
 * and different facets combine with AND. */
export function buildFacet(cards, idsOf, describe, active) {
  const counts = new Map();
  for (const card of cards) for (const id of idsOf(card)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].flatMap(([id, count]) => {
    const option = describe(id);
    return option ? [{...option, id, count, selected: active.has(id)}] : [];
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const matchesFacet = (ids, active) => !active.size || [...active].some(id => ids.includes(id));

/** Toggle one id in the facet selection stored under key; returns the map. */
export function toggleFacet(filters, key, id) {
  const selected = new Set(filters.get(key) ?? []);
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  filters.set(key, selected);
  return filters;
}
