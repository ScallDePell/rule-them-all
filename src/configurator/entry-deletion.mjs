/* Deleting one Ruleset entry, from its editor or from the right-click menu of a list: the same refusal
   ahead of time (§46) and the same confirmations (CP-31). */
import {ENTRY_OPERATIONS} from "./entry-operations.mjs";
import {describeDeletion, rulesetObjectName} from "./deletion-view.mjs";
import {referenceKindTitle} from "../ui/select-option-presentation.mjs";
import {moduleLanguage} from "../core/module-language.mjs";

/** {blocked, reason}: whether the Core would refuse to delete this entry, and who still uses it. */
export function entryDeletionView(api, versionId, kind, id, i18n = globalThis.game?.i18n) {
  const format = (key, data) => { const text = i18n?.format?.(key, data); return text && text !== key ? text : `${key} ${Object.values(data).join(", ")}`.trim(); };
  const ruleset = api.getRuleset(versionId), fr = moduleLanguage().startsWith("fr");
  return describeDeletion(api.getDeletionStatus(versionId, id, kind), {format, nameOf: (k, x) => `${referenceKindTitle(k, fr)} · ${rulesetObjectName(ruleset, k, x)}`});
}

/** Delete the entry; optional references to it are cleared only once confirm(key, data) agrees. False when declined. */
export async function deleteRulesetEntry(api, versionId, kind, id, confirm) {
  const remove = ENTRY_OPERATIONS[kind]?.delete;
  if (!remove) throw new Error(`Entries of kind ${kind} cannot be deleted here.`);
  try { return await api[remove](versionId, id); }
  catch (error) {
    if (error?.code !== "OPTIONAL_REFERENCES") throw error;
    const list = (error.consumers ?? []).map(edge => `${edge.consumerRef.objectKind} ${edge.consumerRef.objectId}`).join(", ");
    if (!await confirm("RTA.UI.ClearOptionalReferences", {list})) return false;
    return api[remove](versionId, id, {clearOptionalReferences: true});
  }
}
