/* What changed in the Rulesets, for other modules that keep references into them (a sheet block, a Content Type):
   after each change of the configurator, each Ruleset version (its draft and its published Ruleset) is compared with
   what it held before, and a change is reported once per version and source. Pure: no Foundry access. */
import {storageFingerprint} from "../configurator/configurator-storage.mjs";
import {layoutNodes} from "../configurator/layout-contract.mjs";

const SOURCES = Object.freeze(["draft", "published"]);
const shapes = new WeakMap();
const byId = (list, of) => new Map((Array.isArray(list) ? list : []).filter(entry => typeof entry?.id === "string").map(entry => [entry.id, of(entry)]));

/** The parts of a Ruleset other modules point at: sheets and their nodes, Content Types, Content Templates. */
export function rulesetShape(ruleset) {
  if (!ruleset || typeof ruleset !== "object") return null;
  let shape = shapes.get(ruleset);
  if (shape) return shape;
  shape = {
    sheetDefinitions: byId(ruleset.sheetDefinitions, sheet => ({fingerprint: storageFingerprint(sheet), nodes: new Map([...layoutNodes(sheet.root)].map(({node}) => [node.id, node.kind]))})),
    contentTypes: byId(ruleset.contentTypes, entry => ({fingerprint: storageFingerprint(entry)})),
    contentTemplates: byId(ruleset.contentTemplates, entry => ({fingerprint: storageFingerprint(entry)}))
  };
  if (Object.isFrozen(ruleset)) shapes.set(ruleset, shape);
  return shape;
}

const NOTHING = Object.freeze({changed: {sheetDefinitions: [], contentTypes: [], contentTemplates: []}, removedNodes: [], retypedNodes: [], removedSheets: []});
const empty = {sheetDefinitions: new Map(), contentTypes: new Map(), contentTemplates: new Map()};
/** The difference between two shapes (null for none): ids added, changed or removed per collection, the nodes removed
 * from a sheet still there, the nodes whose kind changed, and the sheets removed. */
export function diffRulesetShapes(before, after) {
  before ??= empty; after ??= empty;
  const changed = {};
  for (const collection of Object.keys(empty)) {
    const ids = new Set([...before[collection].keys(), ...after[collection].keys()]);
    changed[collection] = [...ids].filter(id => before[collection].get(id)?.fingerprint !== after[collection].get(id)?.fingerprint);
  }
  const removedSheets = [...before.sheetDefinitions.keys()].filter(id => !after.sheetDefinitions.has(id));
  const removedNodes = [], retypedNodes = [];
  for (const [sheetId, sheet] of after.sheetDefinitions) {
    const previous = before.sheetDefinitions.get(sheetId);
    if (!previous) continue;
    for (const [nodeId, kind] of previous.nodes) {
      if (!sheet.nodes.has(nodeId)) removedNodes.push({sheetId, nodeId});
      else if (sheet.nodes.get(nodeId) !== kind) retypedNodes.push({sheetId, nodeId, previous: kind, current: sheet.nodes.get(nodeId)});
    }
  }
  if (!Object.values(changed).some(ids => ids.length) && !removedSheets.length) return null;
  return {changed, removedNodes, retypedNodes, removedSheets};
}

/**
 * Watches the configurator API (listRulesetVersionSummaries, getRuntimeRuleset): scan() after each change calls
 * emit({rulesetId, versionId, source, removed, changed, removedNodes, retypedNodes, removedSheets}) once per version and
 * source that changed. The first scan only records what is there.
 */
export function createRulesetChangeWatcher(api, emit) {
  let known = null;
  const read = () => {
    const next = new Map();
    for (const summary of api.listRulesetVersionSummaries()) for (const source of SOURCES) {
      const ruleset = api.getRuntimeRuleset(summary.versionId, source);
      if (ruleset) next.set(`${summary.versionId}|${source}`, {rulesetId: summary.rulesetId, versionId: summary.versionId, source, shape: rulesetShape(ruleset)});
    }
    return next;
  };
  return {
    scan() {
      const next = read(), previous = known;
      known = next;
      if (!previous) return [];
      const changes = [];
      for (const [key, entry] of next) {
        const before = previous.get(key);
        if (before?.shape === entry.shape) continue;
        const diff = diffRulesetShapes(before?.shape, entry.shape);
        if (diff) changes.push({rulesetId: entry.rulesetId, versionId: entry.versionId, source: entry.source, removed: false, ...diff});
      }
      for (const [key, entry] of previous) if (!next.has(key)) changes.push({rulesetId: entry.rulesetId, versionId: entry.versionId, source: entry.source, removed: true, ...(diffRulesetShapes(entry.shape, null) ?? NOTHING)});
      for (const change of changes) emit(change);
      return changes;
    }
  };
}
