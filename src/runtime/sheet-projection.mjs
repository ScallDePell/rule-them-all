/* What a sheet shows (CP-14): its LayoutNode tree resolved for one Actor or one Item, as plain data a renderer turns into HTML.
   Values are read through the engine (bindings, Modifiers and pool bounds apply) and filtered by Permission (CP-11):
   a value the user may not read, an Action they may not use and a block not for them (seenBy) are left out, never sent then hidden;
   a description sends a pool's words, never its number.
   A value the engine cannot read (a Definition the Actor does not hold, a Formula that needs a missing role) keeps its
   place with value null and the reason in error, so the sheet keeps its shape.

   subject: {actor, content} where actor is the Actor's container ref (null for an Item nobody owns) and content is
   {key} for an owned Content or {templateId} for an Item in the world or a compendium.
   items: the Actor's Items as Foundry has them ([{id, name, img}]), so a contents block shows their names and pictures;
   an Item the Ruleset does not know is listed by a contents block that shows every Content Type. */
import {capabilityTypeRegistry} from "../configurator/capability-type-registry.mjs";
import {findSlot, SLOT_CAPABILITIES} from "../configurator/capability-slots.mjs";
import {descriptionScale, scaleWords} from "../configurator/rule-contracts.mjs";

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

export async function projectSheet(engine, versionId, sheet, {actor = null, content = null, items = []} = {}) {
  const ruleset = engine.ruleset(versionId);
  const context = {roles: actor ? {self: actor} : {}, defaultRole: "self", ...(content?.key ? {content: {key: content.key, role: "self"}} : {})};
  // Who looks: a block not for them is left out, a value only the GM changes is read-only to the others.
  const decisions = new Map(), viewer = await engine.viewer(actor);
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

  // A value only the GM changes stays read-only for the others.
  const writer = node => node.write && (node.write.by !== "gm" || viewer === "gm");
  /** The words of a Definition's description scale (its own, else its type's) for the value read: the number
      and its bounds are dropped, never sent. */
  const describe = (view, reference) => {
    const scale = descriptionScale(ruleset, reference.objectId);
    const text = view.error === undefined ? scaleWords(scale, view.value, view.maximum) : null;
    delete view.minimum; delete view.maximum;
    Object.assign(view, {valueType: "string", value: text});
    if (!scale && view.error === undefined) view.error = `${reference.objectId} has no description scale.`;
    return view;
  };

  const value = async (node, scope, row) => {
    const source = node.source, view = {id: node.id, kind: "value", ...(node.span ? {span: node.span} : {}), ...(node.style ? {style: node.style} : {}), ...(node.icon ? {icon: node.icon} : {}), ...(node.labelShow ? {labelShow: node.labelShow} : {}),
      ...(node.display ? {display: node.display} : {}), ...(node.dots ? {dots: node.dots} : {}), label: node.labelKey || "", value: null, write: null};
    if (source.kind === "output" || source.kind === "each") {
      const reference = source.kind === "output" ? source.reference : eachReference(row?.definition, source);
      // A row whose Definition lacks this capability keeps an empty cell, so the list stays aligned.
      if (!reference && source.kind === "each") return {id: node.id, kind: "spacer"};
      if (!reference || !await allowed("read", "definition", reference.objectId)) return null;
      if (!view.label && source.kind === "output") view.label = ruleset.definitions?.find(d => d.id === reference.objectId)?.nameKey ?? reference.objectId;
      if (!view.label && source.kind === "each") Object.assign(view, outputLabel(row.definition, reference));
      await readOutput(view, reference, scope);
      if (node.display === "description") return describe(view, reference);
      // Dots and gauges of a value count up to its maximum (never fewer than the value, raised by a power).
      if (reference.capabilityId === "value" && ["dots", "gauge"].includes(node.display) && view.error === undefined && scope.roles?.self) {
        try {
          const {minimum, maximum} = await engine.valueBounds(versionId, scope.roles.self, reference.objectId);
          if (maximum !== null) { if (node.display === "dots" && !node.dots) view.dots = Math.max(maximum, Number(view.value) || 0); else if (node.display === "gauge") view.maximum = maximum; }
          if (minimum !== null && node.display === "gauge") view.minimum = minimum;
        } catch { /* no bounds shown */ }
      }
      if (writer(node) && view.error === undefined && await canWrite(reference, scope)) view.write = {operation: node.write.operation};
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
    // content: the Contents the Actor holds of one Content Type, by name (its Origin, its age bracket…).
    if (source.kind === "content") {
      if (!actor) return null;
      owned ??= await engine.listOwnedContents(versionId, actor);
      const type = ruleset.contentTypes?.find(t => t.id === source.contentTypeId), byId = new Map(items.map(item => [item.id, item]));
      if (!view.label) view.label = type?.nameKey ?? source.contentTypeId;
      view.valueType = "string";
      const names = owned.filter(row => row.contentTypeId === source.contentTypeId)
        .map(row => byId.get(row.key)?.name ?? ruleset.contentTemplates?.find(t => t.id === row.templateId)?.nameKey ?? row.templateId);
      view.value = names.length ? names.join(", ") : null;
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
    if (writer(node) && content.key && actor && await engine.adapter.canWrite(actor)) view.write = {operation: node.write.operation};
    return view;
  };

  /** The Contents a contents block lists, by Content Type in Ruleset order; an unavailable one is still listed. */
  let owned;
  const contents = async (node, base) => {
    if (!actor) return null;
    owned ??= await engine.listOwnedContents(versionId, actor);
    const types = node.contentTypeIds ?? [], byId = new Map(items.map(item => [item.id, item]));
    const order = new Map((ruleset.contentTypes ?? []).map((type, index) => [type.id, index]));
    const rows = owned.filter(row => !types.length || types.includes(row.contentTypeId))
      .sort((a, b) => (order.get(a.contentTypeId) ?? 0) - (order.get(b.contentTypeId) ?? 0))
      .map(row => {
        const item = byId.get(row.key), template = ruleset.contentTemplates?.find(t => t.id === row.templateId);
        return {key: row.key, label: item?.name ?? template?.nameKey ?? row.templateId, img: item?.img ?? template?.image ?? "", item: Boolean(item), available: row.available !== false,
          type: ruleset.contentTypes?.find(t => t.id === row.contentTypeId)?.nameKey ?? row.contentTypeId};
      });
    // Items of the game system, or of no Ruleset, under the block that shows everything.
    if (!types.length) {
      const known = new Set(owned.map(row => row.key));
      for (const item of items) if (!known.has(item.id) && !item.managed) rows.push({key: item.id, label: item.name, img: item.img ?? "", item: true, available: true, type: ""});
    }
    return {...base, rows};
  };

  /** What the Actor can buy with a Progression System (engine.describeProgression), with only the Definitions this user
      may read. A purchase is offered to whoever may write both the Definition it raises and its currency; a refused one
      keeps its button, disabled, with the reason. The currency's amount is shown to whoever may read it. */
  const progression = async (node, base) => {
    const system = ruleset.progressionSystems?.find(entry => entry.id === node.progressionSystemRef && enabled(entry));
    if (!actor || !system) return null;
    const name = id => ruleset.definitions?.find(d => d.id === id)?.nameKey ?? id;
    let described;
    try { described = await engine.describeProgression(versionId, system.id, actor); } catch (error) { return {...base, systemId: system.id, advancements: [], milestones: [], error: ERROR(error)}; }
    const advancements = [];
    for (const found of described.advancements) {
      const currency = system.advancements.find(a => a.id === found.id)?.currencyRef, pays = await allowed("write", "definition", currency.objectId);
      const rows = [];
      for (const target of found.targets) {
        if (!await allowed("read", "definition", target.definitionId)) continue;
        const buy = pays && await allowed("write", "definition", target.definitionId);
        rows.push({definitionId: target.definitionId, label: name(target.definitionId), current: target.current, next: target.next, cost: target.cost, buy, ...(buy && !target.allowed ? {reason: target.reason} : {})});
      }
      if (!rows.length) continue;
      advancements.push({id: found.id, label: found.labelKey, currency: name(currency.objectId), funds: await allowed("read", "definition", currency.objectId) ? found.targets[0].funds : null, rows});
    }
    // Applying grants the milestones' Definitions and runs their Actions: offered to whoever may do all of it.
    let apply = false;
    const pending = system.milestones.filter(m => described.milestones.some(d => d.id === m.id && d.reached && !d.applied));
    if (pending.length) {
      apply = true;
      for (const milestone of pending) for (const [operation, kind, id] of [...milestone.definitionIds.map(id => ["write", "definition", id]), ...(milestone.actionRef ? [["execute", "action", milestone.actionRef]] : [])])
        if (!await allowed(operation, kind, id)) apply = false;
    }
    // The milestones behind the Actor, those to apply, and the next one ahead (not every level to come).
    const states = described.milestones.map(m => ({id: m.id, label: m.labelKey, state: m.applied ? "applied" : m.reached ? "reached" : "ahead"}));
    const next = states.find(m => m.state === "ahead");
    return {...base, systemId: system.id, advancements, milestones: states.filter(m => m.state !== "ahead" || m === next), apply};
  };

  const walk = async (node, scope, row) => {
    if (node.seenBy && !node.seenBy.includes(viewer)) return null;
    const base = {id: node.id, kind: node.kind, ...(node.span ? {span: node.span} : {}), ...(node.style ? {style: node.style} : {}), ...(node.icon ? {icon: node.icon} : {}), ...(node.labelShow ? {labelShow: node.labelShow} : {})};
    if (node.kind === "value") return value(node, scope, row);
    if (node.kind === "image") return node.src ? {...base, src: node.src, fit: node.fit ?? "cover", height: node.height ?? "medium", ...(node.shape ? {shape: node.shape} : {})} : null;
    if (node.kind === "text") return {...base, text: node.textKey};
    if (node.kind === "spacer") return base;
    // The Document's name and pictures: the sheet fills them in from the Document (renderSheetHTML).
    if (node.kind === "name") return base;
    if (node.kind === "portrait" || node.kind === "token") return {...base, fit: node.fit ?? "cover", height: node.height ?? "medium", ...(node.shape ? {shape: node.shape} : {}), ...(node.updatePlaced ? {updatePlaced: true} : {})};
    if (node.kind === "contents") return contents(node, base);
    if (node.kind === "progression") return progression(node, base);
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
  return {sheetId: sheet.id, target: sheet.target, header: sheet.header ?? "standard", root:await walk(sheet.root, context, null)};
}
