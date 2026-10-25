/* Other modules' views in the configurator's menu and their cards (integrations.registerConfiguratorSection), as the
   configurator draws them. Pure: no Foundry access, no markup. */

export const EXTENSION_VIEW_PREFIX = "extension:";
export const extensionView = id => `${EXTENSION_VIEW_PREFIX}${id}`;
export const extensionIdOf = view => typeof view === "string" && view.startsWith(EXTENSION_VIEW_PREFIX) ? view.slice(EXTENSION_VIEW_PREFIX.length) : null;

/** A section's menu items with the sections registered under it: each right after the view it names (after the ones
 * already placed there), else at the end. */
export function withExtensionItems(items, sections, {activeView = "", title = text => text} = {}) {
  const out = [...items];
  for (const section of sections) {
    const view = extensionView(section.id);
    const item = {view, title: title(section.title), icon: section.icon, active: activeView === view, extension: true};
    let at = section.after ? out.findIndex(entry => entry.view === section.after) : -1;
    if (at < 0) { out.push(item); continue; }
    while (out[at + 1]?.extension) at++;
    out.splice(at + 1, 0, item);
  }
  return out;
}

const FA_CLASSES = /^(fa-[a-z0-9-]+)( fa-[a-z0-9-]+)*$/;
const text = value => typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
/** The cards a module listed, in the configurator's card shape. Rows without an id are left out. */
export function extensionCards(rows, {color, title = value => value} = {}) {
  return (Array.isArray(rows) ? rows : []).filter(row => row && (typeof row.id === "string" || typeof row.id === "number") && String(row.id) !== "").map(row => {
    const tags = (Array.isArray(row.tags) ? row.tags : []).filter(tag => tag && tag.id !== undefined).map(tag => ({id: text(tag.id), name: text(tag.name ?? tag.id), color: typeof tag.color === "string" ? tag.color : ""}));
    return {
      id: String(row.id), name: title(text(row.name) || String(row.id)), description: text(row.description), image: text(row.image), enabled: row.enabled !== false,
      order: Number.isFinite(row.order) ? row.order : 0, cardColor: color, tags: tags.map(tag => tag.id), displayTags: tags,
      badges: (Array.isArray(row.badges) ? row.badges : []).filter(badge => badge && (badge.label || badge.icon)).map(badge => ({label: text(badge.label), icon: typeof badge.icon === "string" && FA_CLASSES.test(badge.icon.trim()) ? badge.icon.trim() : ""})),
      invalid: row.invalid ? {message: text(row.invalid.message)} : null, isExtension: true
    };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
