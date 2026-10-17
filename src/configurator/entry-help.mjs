/* Built-in help (§8): every editor kind has a localized
   summary and usage note; a Definition also shows its type's description. */
export const HELP_KINDS = Object.freeze(["ruleset","definitionType","definition","parameter","formula","formulaBinding","condition","roll","outcome","test","effect","action","permissionPolicy","eventType","trigger","contentType","contentTemplate","modifier","duration","die","table","scale","creationSystem","progressionSystem","sheetDefinition","tag"]);

/** {summaryKey, usageKey, typeDescription} for an editor kind, or null. */
export function entryHelp(kind, {definitionType = null} = {}) {
  if (!HELP_KINDS.includes(kind)) return null;
  const typeDescription = kind === "definition" ? String(definitionType?.descriptionKey ?? "").trim() : "";
  return {summaryKey: `RTA.Help.${kind}.Summary`, usageKey: `RTA.Help.${kind}.Usage`, typeDescription};
}
