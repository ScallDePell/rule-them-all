import {COLLECTION_FIELDS} from "./configurator-schema.mjs";
import {collectionOfKind} from "./ruleset-parts.mjs";

/** The configurator's name for each family, as the export and import dialogs group entries. */
export const PART_FAMILY_KEYS = Object.freeze({
  definitionTypes: "RTA.Nav.DefinitionTypes", definitions: "RTA.Nav.Definitions", parameters: "RTA.Nav.Parameters", formulas: "RTA.Nav.Formulas",
  formulaBindings: "RTA.Nav.FormulaBindings", conditions: "RTA.Nav.Conditions", rolls: "RTA.Nav.Rolls", outcomes: "RTA.Nav.Outcomes", tests: "RTA.Nav.Tests",
  effects: "RTA.Nav.Effects", actions: "RTA.Nav.Actions", permissionPolicies: "RTA.Nav.Permissions", eventTypes: "RTA.Nav.Events", triggers: "RTA.Nav.Triggers",
  contentTypes: "RTA.Nav.ContentTypes", contentTemplates: "RTA.Nav.Content", modifiers: "RTA.Nav.Modifiers", durations: "RTA.Nav.Durations", dice: "RTA.Nav.Dice",
  tables: "RTA.Nav.Tables", scales: "RTA.Nav.Scales", creationSystems: "RTA.Nav.CreationSystems", progressionSystems: "RTA.Nav.ProgressionSystems",
  sheetDefinitions: "RTA.Nav.SheetDefinitions", sheetTemplates: "RTA.Part.Family.SheetTemplates", sheetThemes: "RTA.Part.Family.SheetThemes", tags: "RTA.Nav.Tags"
});

export const partKey = ref => `${ref.objectKind}:${ref.objectId}`;

/** References grouped by family in the configurator's order, each named: [{collection, items: [{key, name}]}].
    nameOf(collection, id) gives an entry's shown name. */
export function groupPartRefs(refs, nameOf) {
  const groups = new Map();
  for (const ref of refs) {
    const collection = collectionOfKind(ref.objectKind);
    if (!collection) continue;
    if (!groups.has(collection)) groups.set(collection, []);
    groups.get(collection).push({key: partKey(ref), name: String(nameOf(collection, ref.objectId) || ref.objectId)});
  }
  return COLLECTION_FIELDS.filter(collection => groups.has(collection))
    .map(collection => ({collection, items: groups.get(collection).sort((a, b) => a.name.localeCompare(b.name))}));
}

/** A file name from the part's name: rta-part-<name>.json. */
export function partFileName(name) {
  const slug = String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `rta-part-${slug || "ruleset"}.json`;
}

/** The import plan as the dialog shows it: counts, conflicts to decide (named), and new entries. */
export function partImportView(plan, nameOf) {
  const named = row => ({...row, name: String(nameOf(row.collection, row) || row.id)});
  const rows = plan.entries.map(named);
  return {
    counts: {new: rows.filter(row => row.status === "new").length, same: rows.filter(row => row.status === "same").length, conflict: rows.filter(row => row.status === "conflict").length},
    conflicts: rows.filter(row => row.status === "conflict"),
    added: rows.filter(row => row.status === "new"),
    nothingToDo: rows.every(row => row.status === "same")
  };
}

