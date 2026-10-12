/* What a sheet shows (CP-14): its LayoutNode tree resolved for one Actor or one Item, as plain data a renderer turns into HTML.
   Values are read through the engine (bindings, Modifiers and pool bounds apply) and filtered by Permission (CP-11):
   a value the user may not read and an Action they may not use are left out, never sent then hidden.
   A value the engine cannot read (a Definition the Actor does not hold, a Formula that needs a missing role) keeps its
   place with value null and the reason in error, so the sheet keeps its shape.

   subject: {actor, content} where actor is the Actor's container ref (null for an Item nobody owns) and content is
   {key} for an owned Content or {templateId} for an Item in the world or a compendium. */
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {findSlot, SLOT_CAPABILITIES} from "../configurator/capability-slots.mjs";

const enabled = entry => entry?.enabled !== false;
const ERROR = error => String(error?.message ?? error);

/** The stored output a sheet writes when it shows a derived one: a value.final is written through its value.base. */
export function writableReference(reference) {
  return reference.capabilityId === "value" && reference.outputId === "value.final" ? {...reference, outputId: "value.base"} : reference;
}

/** Whether a Formula Binding derives this output: then nothing a sheet writes would change it. */
export function isDerived(ruleset, reference) {
  return (ruleset.formulaBindings ?? []).some(b => enabled(b) && b.targetRef?.objectId === reference.objectId && b.targetRef?.capabilityId === reference.capabilityId
    && b.targetRef?.outputId === reference.outputId && (b.targetRef?.slotId ?? null) === (reference.slotId ?? null));
}

/** The Definition output an "each" source names for one Definition, or null when that Definition lacks the capability or slot. */
export function eachReference(definition, source) {
  if (!(definition?.capabilities ?? []).includes(source.capabilityId)) return null;
  const reference = {objectKind: "definition", objectId: definition.id, capabilityId: source.capabilityId, outputId: source.outputId};
  if (!SLOT_CAPABILITIES.includes(source.capabilityId)) return reference;
  const slotId = source.slotId ?? definition.slots?.[source.capabilityId]?.[0]?.id;
  return slotId && findSlot(definition, source.capabilityId, slotId) ? {...reference, slotId} : null;
}

/** The Definitions a repeater lists: those of its type the Actor holds, in Ruleset order, that its Condition accepts. */
export async function repeaterRows(engine, versionId, ruleset, query, context) {
  if (!context.roles?.self) return [];
  const state = await engine.adapter.load(context.roles.self, {rulesetVersionId: versionId});
  const rows = [];
  for (const definition of ruleset.definitions ?? []) {
    if (!enabled(definition) || definition.definitionTypeId !== query.definitionTypeId || !state.definitionStates?.[definition.id]) continue;
    const rowContext = {...context, variables: {...(context.variables ?? {}), each: {definitionId: definition.id, definition: {objectKind: "definition", objectId: definition.id}}}};
    if (query.conditionRef && !await engine.evaluateCondition(versionId, query.conditionRef, rowContext)) continue;
    rows.push({definition, context: rowContext});
  }
  return rows;
}

/** How a repeater row names one of its values: a pool by its slot name, any other output by what it is (Value, Active...). */
export function outputLabel(definition, reference) {
  const slot = reference.slotId ? findSlot(definition, reference.capabilityId, reference.slotId) : null;
  if (slot?.name) return {label: slot.name};
  const [capability, output] = reference.outputId.split(".");
  return {label: "", labelKey: `RTA.Sheet.Output.${capability[0].toUpperCase()}${capability.slice(1)}${output[0].toUpperCase()}${output.slice(1)}`};
}

export async function projectSheet(engine, versionId, sheet, {actor = null, content = null} = {}) {
  const ruleset = engine.ruleset(versionId);
  const context = {roles: actor ? {self: actor} : {}, defaultRole: "self", ...(content?.key ? {content: {key: content.key, role: "self"}} : {})};
  const decisions = new Map();
  const allowed = async (operation, objectKind, objectId) => {
    const key = `${operation}|${objectKind}|${objectId}`;
    if (!decisions.has(key)) decisions.set(key, (await engine.authorize(versionId, operation, {objectKind, objectId}, actor, actor ? context : null)).allowed);
    return decisions.get(key);
  };
  let shown;
  /** The Content this Item sheet shows: its Content Type and its field values (an owned Content keeps its own). */
  const shownContent = async () => {
    if (shown !== undefined) return shown;
    const owned = content?.key && actor ? (await engine.listOwnedContents(versionId, actor)).find(row => row.key === content.key) : null;
    const template = ruleset.contentTemplates?.find(t => t.id === (owned?.templateId ?? content?.templateId));
    const typeId = owned?.contentTypeId ?? template?.contentTypeId;
    shown = typeId ? {type: ruleset.contentTypes?.find(type => type.id === typeId) ?? null, fields: owned?.fields ?? structuredClone(template?.data ?? {})} : null;
    return shown;
  };

  const readOutput = async (view, reference, scope) => {
    view.target = {definitionId: reference.objectId, capabilityId: reference.capabilityId, outputId: reference.outputId, ...(reference.slotId ? {slotId: reference.slotId} : {})};
    view.valueType = capabilityTypeRegistry.get(reference.capabilityId)?.outputs?.[reference.outputId]?.valueType ?? "number";
    try {
      view.value = await engine.resolveReference(versionId, reference, scope);
      if (reference.capabilityId === "pool" && reference.outputId === "pool.current") {
        for (const bound of ["minimum", "maximum"]) {
          const value = await engine.resolveReference(versionId, {...reference, outputId: `pool.${bound}`}, scope);
          if (value !== null && value !== undefined) view[bound] = value;
        }
      }
    } catch (error) { view.value = null; view.error = ERROR(error); }
  };
  const canWrite = async (reference, scope) => {
    if (isDerived(ruleset, reference) || !await allowed("write", "definition", reference.objectId)) return false;
    try { await engine.resolveReference(versionId, writableReference(reference), scope, {forWrite: true}); return true; } catch { return false; }
  };

  const value = async (node, scope, row) => {
    const source = node.source, view = {id: node.id, kind: "value", ...(node.span ? {span: node.span} : {}), label: node.labelKey || "", value: null, write: null};
    if (source.kind === "output" || source.kind === "each") {
      const reference = source.kind === "output" ? source.reference : eachReference(row?.definition, source);
      // A row whose Definition lacks this capability keeps an empty cell, so the list stays aligned.
      if (!reference && source.kind === "each") return {id: node.id, kind: "spacer"};
      if (!reference || !await allowed("read", "definition", reference.objectId)) return null;
      if (!view.label && source.kind === "output") view.label = ruleset.definitions?.find(d => d.id === reference.objectId)?.nameKey ?? reference.objectId;
      if (!view.label && source.kind === "each") Object.assign(view, outputLabel(row.definition, reference));
      await readOutput(view, reference, scope);
      if (node.write && view.error === undefined && await canWrite(reference, scope)) view.write = {operation: node.write.operation};
      return view;
    }
    if (source.kind === "formula") {
      if (!await allowed("read", "formula", source.formulaRef)) return null;
      const formula = ruleset.formulas?.find(f => f.id === source.formulaRef);
      if (!view.label) view.label = formula?.nameKey ?? source.formulaRef;
      view.valueType = formula?.resultType ?? "number";
      try { view.value = await engine.evaluateFormula(versionId, source.formulaRef, scope); } catch (error) { view.error = ERROR(error); }
      return view;
    }
    if (source.kind === "parameter") {
      if (!await allowed("read", "parameter", source.parameterRef)) return null;
      const parameter = ruleset.parameters?.find(p => p.id === source.parameterRef);
      if (!view.label) view.label = parameter?.nameKey ?? source.parameterRef;
      view.valueType = parameter?.valueType ?? "number";
      try { view.value = engine.evaluator(versionId).parameter(source.parameterRef); } catch (error) { view.error = ERROR(error); }
      return view;
    }
    // field: a field of the Content this Item sheet shows; only an owned Content keeps its own values.
    // A sheet shared by several Content Types leaves out the fields this one does not have.
    const current = await shownContent(), field = current?.type?.fields?.[source.fieldId];
    if (!field) return null;
    view.target = {fieldId: source.fieldId};
    if (!view.label) view.label = field.name ?? source.fieldId;
    view.valueType = field.valueType;
    view.value = Object.hasOwn(current.fields, source.fieldId) ? current.fields[source.fieldId] : null;
    if (node.write && content.key && actor && await engine.adapter.canWrite(actor)) view.write = {operation: node.write.operation};
    return view;
  };

  const walk = async (node, scope, row) => {
    const base = {id: node.id, kind: node.kind, ...(node.span ? {span: node.span} : {})};
    if (node.kind === "value") return value(node, scope, row);
    if (node.kind === "text") return {...base, text: node.textKey};
    if (node.kind === "spacer") return base;
    if (node.kind === "action") {
      const action = ruleset.actions?.find(a => a.id === node.actionRef && enabled(a));
      if (!action || !actor || !await allowed("execute", "action", action.id)) return null;
      return {...base, label: node.labelKey || action.nameKey || action.id, actionId: action.id, definitionId: row?.definition.id ?? null};
    }
    const children = async (nodes, s, r) => (await Promise.all(nodes.map(child => walk(child, s, r)))).filter(Boolean);
    if (node.kind === "repeater") {
      const rows = [];
      for (const found of await repeaterRows(engine, versionId, ruleset, node.query, scope)) {
        if (!await allowed("read", "definition", found.definition.id)) continue;
        rows.push({definitionId: found.definition.id, label: found.definition.nameKey ?? found.definition.id, children: await children(node.children, found.context, found)});
      }
      return {...base, columns: node.columns, rows};
    }
    return {...base, ...(node.columns ? {columns: node.columns} : {}), ...(node.labelKey !== undefined ? {label: node.labelKey} : {}), children: await children(node.children, scope, row)};
  };
  return {sheetId: sheet.id, target: sheet.target, root: await walk(sheet.root, context, null)};
}
