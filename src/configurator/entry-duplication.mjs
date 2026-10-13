/* "Dupliquer": a copy of one Ruleset entry under a new name, saved as a new entry of the same kind.
   The copy gets a fresh id (and key) taken from its name; what must stay unique (a die's letter) is left empty. */
import {copyJSON} from "./configurator-schema.mjs";
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";

const COLLECTION = {die: "dice", category: "categories", tag: "tags"};
export const entryCollection = kind => COLLECTION[kind] ?? `${kind}s`;
const slug = value => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const free = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };

/** The copy of `entry` named `name`, with an id (and key) not used by its collection. */
export function duplicateEntryData(ruleset, kind, entry, name) {
  if (!ENTRY_OPERATIONS[kind]) throw new Error(`Entries of kind ${kind} cannot be duplicated.`);
  const label = String(name ?? "").trim();
  if (!label) throw new Error("A name is required for the copy.");
  const entries = ruleset?.[entryCollection(kind)] ?? [], copy = copyJSON(entry);
  copy.id = free(slug(label) || kind, new Set(entries.map(x => x.id)));
  copy.nameKey = label;
  if (Object.hasOwn(copy, "key")) copy.key = free(slug(label) || copy.id, new Set(entries.map(x => x.key)));
  if (Object.hasOwn(copy, "order")) delete copy.order;
  if (kind === "die") copy.denomination = "";
  return copy;
}
