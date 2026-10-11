/* Delete buttons know in advance whether the Core will refuse (§46).
   Pure: the editor passes the deletion status and a naming
   function; the GM sees who still uses the object before clicking. */
import {collectionOfKind} from "./change-impact.mjs";

/** {blocked, reason}: blocked when a required (or metadata) consumer exists. */
export function describeDeletion(status, {nameOf = (kind, id) => `${kind} ${id}`, format = (key, data) => `${key} ${JSON.stringify(data)}`} = {}) {
  if (!status || status.canDelete) return {blocked: false, reason: ""};
  const seen = new Set(), names = [];
  for (const edge of status.consumers ?? []) {
    if (edge.strength === "optional") continue;
    const key = `${edge.consumerRef.objectKind}|${edge.consumerRef.objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(nameOf(edge.consumerRef.objectKind, edge.consumerRef.objectId));
  }
  return {blocked: true, reason: format("RTA.UI.DeleteBlocked", {list: names.join(", ")})};
}

/** Display name of a Ruleset object: its nameKey, else its id. */
export function rulesetObjectName(ruleset, kind, id) {
  const collection = collectionOfKind(kind);
  const entry = collection ? (ruleset?.[collection] ?? []).find(item => item?.id === id) : null;
  return entry?.nameKey || entry?.key || id;
}
