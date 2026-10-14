/* Copy, paste, duplicate and the style brush of the sheet editor: pure operations on a LayoutNode tree
   (layout-contract.mjs). A copied block keeps its children and its style; pasted, it gets new ids, and goes into the
   selected block when that is a container that takes it, else right after it. The clipboard is shared by every sheet
   editor of the browser session (and kept across a reload), so a block can go from one sheet, or one Ruleset, to another:
   a block that names what the Ruleset or the sheet does not have is refused (missingReferences). */
import {LAYOUT_CONTAINERS} from "./layout-contract.mjs";
import {prepareLayoutStyle} from "./layout-style-contract.mjs";
import {canPlace, childKinds, contentFields, insertNode, isContainer, locate, repeaterOf, updateNode} from "./sheet-layout-model.mjs";

const STORAGE_KEY = "rule-them-all.sheet-clipboard";
let clipboard = null;

/** Keep a block for pasting, here and in the other sheet editors of the session. */
export function copyToClipboard(node) {
  clipboard = structuredClone(node);
  try { globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(clipboard)); } catch { /* storage refused: this window still has it */ }
}
/** The copied block, or null. */
export function readClipboard() {
  if (!clipboard) try { clipboard = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? "null"); } catch { clipboard = null; }
  return clipboard ? structuredClone(clipboard) : null;
}
export function clearClipboard() {
  clipboard = null;
  try { globalThis.sessionStorage?.removeItem(STORAGE_KEY); } catch { /* nothing kept */ }
}

function* nodes(root) { if (!root) return; yield root; for (const child of root.children ?? []) yield* nodes(child); }

/** A copy of a block and all it holds, with ids no node of the tree uses yet. */
export function withFreshIds(node, root) {
  const used = new Set([...nodes(root)].map(entry => entry.id)), next = structuredClone(node);
  for (const entry of nodes(next)) {
    let n = 1;
    while (used.has(`${entry.kind}-${n}`)) n++;
    entry.id = `${entry.kind}-${n}`;
    used.add(entry.id);
  }
  return next;
}

/** Where a pasted block goes: into the selection when it is a container that takes it, else right after it;
   null when it fits in neither. after: always right after the selection (Duplicate). */
export function pastePlace(root, node, selectedId, {after = false} = {}) {
  const target = locate(root, selectedId) ?? locate(root, root.id);
  if (!after && isContainer(target.node) && childKinds(target.node).includes(node.kind) && canPlace(root, node, target.node.id)) return {targetId: target.node.id, beside: false};
  if (target.parent && canPlace(root, node, target.node.id, {beside: true})) return {targetId: target.node.id, beside: true};
  return null;
}

/** The ids a block (once placed at its id in the tree) names that this Ruleset or this sheet does not have:
   a Definition, a Formula, a Parameter, an Action, a Progression System, a Definition type, a Condition, a Content
   Type, a Content field, and the row output a list's Definitions do not give. Blocks only an Actor sheet (or only an
   Item sheet) has count too. */
export function missingReferences(root, nodeId, ruleset, {target = "actor", contentTypeIds = []} = {}) {
  const missing = new Set(), has = (list, id) => (ruleset[list] ?? []).some(entry => entry.id === id);
  const need = (ok, id) => { if (!ok) missing.add(id); };
  const placed = locate(root, nodeId)?.node;
  for (const node of nodes(placed)) {
    const source = node.source;
    if (source?.kind === "output") need(has("definitions", source.reference?.objectId), source.reference?.objectId);
    if (source?.kind === "formula") need(has("formulas", source.formulaRef), source.formulaRef);
    if (source?.kind === "parameter") need(has("parameters", source.parameterRef), source.parameterRef);
    if (source?.kind === "content") need(target === "actor" && has("contentTypes", source.contentTypeId), source.contentTypeId);
    if (source?.kind === "field") need(target === "item" && contentFields(ruleset, contentTypeIds).some(field => field.id === source.fieldId), source.fieldId);
    if (source?.kind === "each") {
      const typeId = repeaterOf(root, node.id)?.query?.definitionTypeId;
      need((ruleset.definitions ?? []).some(d => d.definitionTypeId === typeId && (d.capabilities ?? []).includes(source.capabilityId)), source.outputId);
    }
    if (node.kind === "action") need(has("actions", node.actionRef), node.actionRef);
    if (node.kind === "progression") need(target === "actor" && has("progressionSystems", node.progressionSystemRef), node.progressionSystemRef);
    if (node.kind === "contents") { need(target === "actor", node.kind); for (const id of node.contentTypeIds ?? []) need(has("contentTypes", id), id); }
    if (node.kind === "repeater") {
      need(has("definitionTypes", node.query?.definitionTypeId), node.query?.definitionTypeId);
      if (node.query?.conditionRef) need(has("conditions", node.query.conditionRef), node.query.conditionRef);
    }
  }
  return [...missing].filter(Boolean);
}

/** Paste (or duplicate) a block next to or into the selection: {root, id} of the new tree and the pasted block;
   {error: "place"} when it cannot go there, {error: "missing", missing} when it names what is not here. */
export function pasteBlock(root, node, selectedId, ruleset, {target = "actor", contentTypeIds = [], after = false} = {}) {
  const block = withFreshIds(node, root), place = pastePlace(root, block, selectedId, {after});
  if (!place) return {error: "place"};
  // A width wider than its new place shrinks to fit (updateNode clamps the spans).
  const next = updateNode(insertNode(root, place.targetId, block, {beside: place.beside}), block.id, {});
  const missing = missingReferences(next, block.id, ruleset, {target, contentTypeIds});
  return missing.length ? {error: "missing", missing} : {root: next, id: block.id};
}

/** The part of a style a block of this kind can take (a gauge color only on a value, a background picture only on a
   container…); undefined when nothing is left. */
export function styleFor(kind, style) {
  const kept = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    try { if (prepareLayoutStyle({[key]: value}, kind, "style", {containers: LAYOUT_CONTAINERS})) kept[key] = value; } catch { /* not for this kind */ }
  }
  return Object.keys(kept).length ? kept : undefined;
}
