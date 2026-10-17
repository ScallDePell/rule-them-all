/* "Tags…" from an entry's right-click menu: the tags the GM checks, plus a tag named in the dialog. Pure. */
import {freeId, readableId} from "./identity.mjs";

/** {ids, create}: the entry's tags after the dialog (chosen: {ids, newTag}), and the tag to create first ({id, nameKey}),
    or null when the name is empty or names a tag the Ruleset has (that tag is checked instead). */
export function entryTagsAfter(ruleset, chosen) {
  const tags = ruleset?.tags ?? [], ids = [...new Set(chosen.ids)], name = String(chosen.newTag ?? "").trim();
  if (!name) return {ids, create: null};
  const same = tags.find(tag => String(tag.nameKey ?? "").trim().toLowerCase() === name.toLowerCase());
  const create = same ? null : {id: freeId(readableId(name) || "tag", new Set(tags.map(tag => tag.id))), nameKey: name};
  const id = same?.id ?? create.id;
  return {ids: ids.includes(id) ? ids : [...ids, id], create};
}
