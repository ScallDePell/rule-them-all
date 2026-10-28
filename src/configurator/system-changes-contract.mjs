/* Definition.systemChanges: what a state Definition changes in the game system's own data (dnd5e's
   system.abilities.str.value) while it is active on an Actor, through a Foundry Active Effect the GM client keeps
   in step (src/runtime/foundry-system-changes.mjs). Rows: {key, type, value}, the Active Effect change of Foundry v14. */
import {isRecord} from "./configurator-schema.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";

export const SYSTEM_CHANGE_TYPES = Object.freeze(["add", "multiply", "override", "upgrade", "downgrade"]);
const KEY = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

/** Problems of a Definition's systemChanges: [{path, message}] (none when they can be stored). */
export function systemChangeProblems(changes, capabilities = [], path = "systemChanges") {
  if (changes === undefined) return [];
  if (!Array.isArray(changes)) return [{path, message: "systemChanges must be an array of {key, type, value}."}];
  const problems = [];
  if (changes.length && !capabilities.includes("state")) problems.push({path, message: "systemChanges need the state capability: they apply while the state is active."});
  changes.forEach((change, i) => {
    const at = `${path}[${i}]`;
    if (!isRecord(change)) return problems.push({path: at, message: "A system change must be {key, type, value}."});
    for (const key of Object.keys(change)) if (!["key", "type", "value"].includes(key)) problems.push({path: at, message: `A system change contains unsupported field: ${key}.`});
    if (typeof change.key !== "string" || !KEY.test(change.key)) problems.push({path: `${at}.key`, message: "key must be a data path such as system.abilities.str.value."});
    else if (change.key === `flags.${MODULE_ID}` || change.key.startsWith(`flags.${MODULE_ID}.`)) problems.push({path: `${at}.key`, message: "A system change cannot write the module's own data."});
    if (!SYSTEM_CHANGE_TYPES.includes(change.type)) problems.push({path: `${at}.type`, message: `type must be one of ${SYSTEM_CHANGE_TYPES.join(", ")}.`});
    if (!["string", "number", "boolean"].includes(typeof change.value) || String(change.value).trim() === "") problems.push({path: `${at}.value`, message: "value must be a number or a text."});
  });
  return problems;
}
