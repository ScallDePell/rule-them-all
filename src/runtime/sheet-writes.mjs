/* Writing from a sheet (CP-30 WriteIntent). The sheet only says which of its value nodes changed and to what;
   the engine finds what that node shows, checks it may be written (the node allows it, Permission, a held
   Definition, a stored output) and writes through the usual transaction, so bounds, the ledger and the GM relay apply.
   intent: {sheetId, nodeId, value, definitionId?, contentKey?, contentTypeId?}
   - definitionId: the repeater row the value belongs to;
   - contentKey: the owned Content an Item sheet shows; contentTypeId picks the AUTO Item sheet.
   A notes block takes its new text as value (stored on the Actor under the block's id, engine.setNote).
   A block hidden by its Condition (visibleIf) is not written through either.
   With add or subtract, value is the amount; with adjust, a signed amount (−1 lowers by 1); with set, the new value. Setting a value.final moves its value.base by the difference. */
import {sheetFor} from "../configurator/sheet-auto-layout.mjs";
import {normalizeRuntimeContainerRef} from "./runtime-contracts.mjs";
import {RuntimeTransactionError, TRANSACTION_ERRORS} from "./runtime-transaction.mjs";
import {eachReference, isDerived, repeaterRows, writableReference} from "./sheet-projection.mjs";

/** A node and the containers above it. */
function findPath(node, id, path = []) {
  if (node?.id === id) return [...path, node];
  for (const child of node?.children ?? []) { const found = findPath(child, id, [...path, node]); if (found) return found; }
  return null;
}
/** How an amount moves the value: added, taken away, or as signed (adjust). */
const sign = operation => operation === "subtract" ? -1 : 1;
const forbidden = message => new RuntimeTransactionError(TRANSACTION_ERRORS.forbidden, message);

export async function writeSheetValue(engine, versionId, containerRef, intent = {}) {
  const ruleset = engine.ruleset(versionId), actor = normalizeRuntimeContainerRef(containerRef);
  const target = intent.contentKey ? "item" : "actor";
  const sheet = intent.sheetId === "auto" ? sheetFor({...ruleset, sheetDefinitions: []}, {target, contentTypeId: intent.contentTypeId ?? null})
    : (ruleset.sheetDefinitions ?? []).find(entry => entry.id === intent.sheetId && entry.enabled !== false && entry.target === target);
  if (!sheet) throw new Error(`Sheet unavailable: ${intent.sheetId}.`);
  const path = findPath(sheet.root, intent.nodeId), node = path?.at(-1);
  if (!["value", "notes"].includes(node?.kind) || !node.write) throw forbidden(`This sheet does not let ${intent.nodeId} be changed.`);
  // Nobody writes through a block they do not get, nor a value only the GM changes.
  const viewer = path.some(entry => entry.seenBy) || node.write.by ? await engine.viewer(actor) : null;
  if (path.some(entry => entry.seenBy && !entry.seenBy.includes(viewer))) throw forbidden(`${intent.nodeId} is not on your sheet.`);
  if (node.write.by === "gm" && viewer !== "gm") throw forbidden(`Only a GM can change ${intent.nodeId}.`);
  const operation = node.write.operation, source = node.source;
  const context = {roles: {self: actor}, defaultRole: "self"};
  // Inside a list, a block's Condition is evaluated for the row's Definition (variables.each), as the sheet showed it.
  const listed = path.findLastIndex(entry => entry.kind === "repeater");
  const rowScope = listed >= 0 && intent.definitionId ? {...context, variables: {each: {definitionId: intent.definitionId, definition: {objectKind: "definition", objectId: intent.definitionId}}}} : context;
  for (const [i, entry] of path.entries()) if (entry.visibleIf && !await engine.evaluateCondition(versionId, entry.visibleIf, listed >= 0 && i > listed ? rowScope : context)) throw forbidden(`${intent.nodeId} is not on your sheet.`);
  if (node.kind === "notes") {
    if (target !== "actor") throw forbidden("Notes are kept on an Actor.");
    if (typeof intent.value !== "string") throw new Error("A note is text.");
    return engine.setNote(versionId, actor, node.id, intent.value);
  }

  if (source.kind === "field") {
    if (!intent.contentKey) throw new Error("A Content field needs the owned Content it belongs to.");
    if (!await engine.adapter.canWrite(actor)) throw forbidden("You cannot change this Item.");
    const current = (await engine.listOwnedContents(versionId, actor)).find(row => row.key === intent.contentKey);
    if (!current) throw new Error(`Owned Content not found: ${intent.contentKey}.`);
    const value = operation === "set" ? intent.value : Number(current.fields?.[source.fieldId] ?? 0) + sign(operation) * Number(intent.value);
    return engine.setContentField(versionId, actor, intent.contentKey, source.fieldId, value);
  }

  let reference = source.reference, scope = context;
  if (source.kind === "each") {
    const repeater = path.findLast(entry => entry.kind === "repeater");
    const row = (await repeaterRows(engine, versionId, ruleset, repeater.query, context)).find(entry => entry.definition.id === intent.definitionId);
    if (!row) throw new Error(`${intent.definitionId} is not listed on this sheet.`);
    reference = eachReference(row.definition, source); scope = row.context;
    if (!reference) throw new Error(`${intent.definitionId} has no ${source.capabilityId}.`);
  }
  if (source.kind !== "output" && source.kind !== "each") throw forbidden("Only a Definition output or a Content field can be changed from a sheet.");
  const decision = await engine.authorize(versionId, "write", {objectKind: "definition", objectId: reference.objectId}, actor, scope);
  if (!decision.allowed) throw forbidden(decision.messageKey ? globalThis.game?.i18n?.localize?.(decision.messageKey) ?? decision.messageKey : `Permission denied: write definition ${reference.objectId}.`);
  if (isDerived(ruleset, reference)) throw forbidden(`${reference.objectId} is computed by a Formula.`);
  const stored = writableReference(reference);
  await engine.resolveReference(versionId, stored, scope, {forWrite: true});
  const shown = await engine.resolveReference(versionId, reference, scope);
  const next = reference.capabilityId === "state" ? (operation === "set" ? Boolean(intent.value) : !shown)
    : operation === "set" ? Number(intent.value) : Number(shown) + sign(operation) * Number(intent.value);
  if (reference.capabilityId !== "state" && !Number.isFinite(next)) throw new Error("A number is expected.");
  const id = reference.objectId;
  if (reference.capabilityId === "value") {
    const base = Number(await engine.resolveReference(versionId, stored, scope));
    return engine.setDefinitionState(versionId, actor, id, {base: base + (next - Number(shown))});
  }
  if (reference.capabilityId === "pool") return engine.setDefinitionState(versionId, actor, id, {pools: {[reference.slotId]: next}});
  if (reference.capabilityId === "state") return engine.setDefinitionState(versionId, actor, id, {active: next});
  throw forbidden(`${reference.outputId} cannot be changed from a sheet.`);
}
