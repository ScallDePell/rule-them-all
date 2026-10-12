/* The sheet editor's model: pure operations on a LayoutNode tree (layout-contract.mjs) and the preview the
   editor shows. The preview goes through the same markup as a played sheet (ui/sheet-markup.mjs), with sample
   values, so what the editor shows is the sheet the players get. Every operation returns a new tree. */
import {capabilityTypeRegistry} from "./capability-type-registry.mjs";
import {LAYOUT_CONTAINERS, LAYOUT_WRITABLE_SOURCES} from "./layout-contract.mjs";

const copy = value => structuredClone(value);
const enabled = entry => entry?.enabled !== false;
const MAX_COLUMNS = {section: 4, grid: 6, repeater: 6};
/** Capability outputs a repeater row can show, with whether a sheet may write them. */
export const EACH_OUTPUTS = Object.freeze([
  {capabilityId: "value", outputId: "value.final", writable: true}, {capabilityId: "value", outputId: "value.base", writable: true},
  {capabilityId: "pool", outputId: "pool.current", writable: true}, {capabilityId: "pool", outputId: "pool.maximum", writable: false},
  {capabilityId: "state", outputId: "state.active", writable: true}, {capabilityId: "state", outputId: "state.stacks", writable: false},
  {capabilityId: "collection", outputId: "collection.count", writable: false}
]);

/** {node, parent, index, path: [ancestors…, node]} for a node id, or null. */
export function locate(root, id, parent = null, index = 0, path = []) {
  if (!root) return null;
  const here = [...path, root];
  if (root.id === id) return {node: root, parent, index, path: here};
  for (const [i, child] of (root.children ?? []).entries()) { const found = locate(child, id, root, i, here); if (found) return found; }
  return null;
}
export const insideRepeater = (root, id) => Boolean(locate(root, id)?.path.slice(0, -1).some(node => node.kind === "repeater"));
/** The repeater a node sits in (the nearest), or null. */
export const repeaterOf = (root, id) => locate(root, id)?.path.slice(0, -1).findLast(node => node.kind === "repeater") ?? null;
export const isContainer = node => LAYOUT_CONTAINERS.includes(node?.kind);
/** The kinds a container accepts: tabs hold only tabs; a tab is only in tabs. */
export const childKinds = parent => !isContainer(parent) ? [] : parent.kind === "tabs" ? ["tab"] : ["section", "grid", "tabs", "repeater", "value", "action", "text", "image", "contents", "spacer"];
export const columnsOf = node => MAX_COLUMNS[node?.kind] ? node.columns ?? 1 : 1;
export const maxColumns = kind => MAX_COLUMNS[kind] ?? 1;

function ids(root, out = new Set()) { if (root) { out.add(root.id); for (const child of root.children ?? []) ids(child, out); } return out; }
function freshId(root, kind) { const used = ids(root); let n = 1; while (used.has(`${kind}-${n}`)) n++; return `${kind}-${n}`; }

/** What a new value shows by default: inside a repeater, the row's main output; else the first Definition output, Formula or Parameter. */
function defaultSource(ruleset, {repeater = null, target = "actor"} = {}) {
  if (repeater) {
    const capabilities = new Set((ruleset.definitions ?? []).filter(d => d.definitionTypeId === repeater.query?.definitionTypeId).flatMap(d => d.capabilities ?? []));
    const output = EACH_OUTPUTS.find(o => capabilities.has(o.capabilityId)) ?? EACH_OUTPUTS[0];
    return {kind: "each", capabilityId: output.capabilityId, outputId: output.outputId};
  }
  if (target === "item") {
    const fieldId = (ruleset.contentTypes ?? []).flatMap(type => Object.keys(type.fields ?? {}))[0];
    if (fieldId) return {kind: "field", fieldId};
  }
  for (const definition of (ruleset.definitions ?? []).filter(enabled)) {
    const output = EACH_OUTPUTS.find(o => (definition.capabilities ?? []).includes(o.capabilityId) && !["pool", "collection"].includes(o.capabilityId));
    if (output) return {kind: "output", reference: {objectKind: "definition", objectId: definition.id, capabilityId: output.capabilityId, outputId: output.outputId}};
  }
  const formula = (ruleset.formulas ?? [])[0];
  if (formula) return {kind: "formula", formulaRef: formula.id};
  const parameter = (ruleset.parameters ?? [])[0];
  return parameter ? {kind: "parameter", parameterRef: parameter.id} : null;
}

/** A new node of this kind, ready to show something; null when the Ruleset has nothing it could show (a value without any source…). */
export function newNode(kind, root, ruleset, {parentId = root?.id, target = "actor"} = {}) {
  const id = freshId(root, kind);
  if (kind === "section") return {id, kind, labelKey: "", columns: 1, children: []};
  if (kind === "grid") return {id, kind, columns: 2, children: []};
  if (kind === "tab") return {id, kind, labelKey: "", children: []};
  if (kind === "tabs") {
    // Two pages to start with: tabs are for switching between them.
    const first = freshId({children: [root, {id}]}, "tab"), second = freshId({children: [root, {id}, {id: first}]}, "tab");
    return {id, kind, children: [{id: first, kind: "tab", labelKey: "", children: []}, {id: second, kind: "tab", labelKey: "", children: []}]};
  }
  if (kind === "repeater") {
    const type = (ruleset.definitionTypes ?? []).find(t => (ruleset.definitions ?? []).some(d => d.definitionTypeId === t.id));
    return type ? {id, kind, query: {definitionTypeId: type.id}, columns: 1, children: []} : null;
  }
  if (kind === "value") {
    const parent = locate(root, parentId);
    const repeater = parent ? [...parent.path].reverse().find(node => node.kind === "repeater") ?? null : null;
    const source = defaultSource(ruleset, {repeater, target});
    return source ? {id, kind, source} : null;
  }
  if (kind === "action") { const action = (ruleset.actions ?? []).find(enabled); return action ? {id, kind, actionRef: action.id} : null; }
  if (kind === "text") return {id, kind, textKey: ""};
  if (kind === "image") return {id, kind, src: ""};
  if (kind === "contents") {
    // An Actor's Items: not on an Item sheet, not once per row of a list.
    const parent = locate(root, parentId);
    if (target === "item" || parent?.path.some(node => node.kind === "repeater") || !itemContentTypes(ruleset).length) return null;
    return {id, kind};
  }
  return {id, kind: "spacer"};
}

/** What the editor offers to add, grouped: layout blocks, fields (a value, a gauge, dots, an Action button, the held
   Contents), a list per Definition family, and on an Actor sheet the Content it holds of each type (its Origin…);
   on an Item sheet, the Content fields. Each item: {label | labelKey, kind, spec}; paletteNode turns a spec into a node.
   A single Definition, Formula or Action is chosen in the block's settings once it is placed. */
export function paletteGroups(ruleset, {target = "actor", contentTypeIds = []} = {}) {
  const groups = [], name = entry => entry.nameKey ?? entry.id;
  groups.push({id: "layout", labelKey: "RTA.SheetEditor.Palette.Layout", items: ["section", "grid", "tabs", "text", "image", "spacer"].map(kind => ({kind, spec: {kind}}))});
  const fields = [
    {kind: "value", labelKey: "RTA.SheetEditor.Kind.value", spec: {kind: "value"}},
    ...(target === "actor" ? [{kind: "gauge", labelKey: "RTA.SheetEditor.Display.gauge", spec: {kind: "value", display: "gauge"}}, {kind: "dots", labelKey: "RTA.SheetEditor.Display.dots", spec: {kind: "value", display: "dots"}}] : []),
    ...((ruleset.actions ?? []).some(enabled) ? [{kind: "action", spec: {kind: "action"}}] : []),
    ...(target === "actor" && itemContentTypes(ruleset).length ? [{kind: "contents", spec: {kind: "contents"}}] : [])];
  groups.push({id: "fields", labelKey: "RTA.SheetEditor.Palette.Fields", items: fields});
  if (target === "item") {
    const contentFieldList = contentFields(ruleset, contentTypeIds);
    if (contentFieldList.length) groups.push({id: "content-fields", labelKey: "RTA.SheetEditor.Palette.ContentFields", items: contentFieldList.map(field => ({label: field.name ?? field.id, kind: "value", spec: {kind: "value", source: {kind: "field", fieldId: field.id}}}))});
    return groups;
  }
  const families = (ruleset.definitionTypes ?? []).filter(type => enabled(type) && (ruleset.definitions ?? []).some(d => enabled(d) && d.definitionTypeId === type.id));
  if (families.length) groups.push({id: "families", labelKey: "RTA.SheetEditor.Palette.Families", items: families.map(type => ({label: name(type), kind: "repeater", spec: {kind: "repeater", definitionTypeId: type.id}}))});
  const held = (ruleset.contentTypes ?? []).filter(enabled);
  if (held.length) groups.push({id: "held", labelKey: "RTA.SheetEditor.Palette.Held", items: held.map(type => ({label: name(type), kind: "content", spec: {kind: "value", source: {kind: "content", contentTypeId: type.id}}}))});
  return groups;
}

/** The first Definition output a gauge can fill: a pool's current points, else any number. */
function gaugeSource(ruleset) {
  const definition = (ruleset.definitions ?? []).find(d => enabled(d) && (d.capabilities ?? []).includes("pool"));
  if (!definition) return null;
  const slotId = definition.slots?.pool?.[0]?.id;
  return {kind: "output", reference: {objectKind: "definition", objectId: definition.id, capabilityId: "pool", ...(slotId ? {slotId} : {}), outputId: "pool.current"}};
}

/** The node a palette spec adds, with a fresh id; null when it cannot be built (a list with no Definition type…). */
export function paletteNode(spec, root, ruleset, {parentId = root?.id, target = "actor"} = {}) {
  if (spec?.kind === "repeater" && spec.definitionTypeId) {
    const id = freshId(root, "repeater"), node = {id, kind: "repeater", query: {definitionTypeId: spec.definitionTypeId}, columns: 1, children: []};
    // A new list shows each Definition's main value straight away.
    const output = EACH_OUTPUTS.find(o => (ruleset.definitions ?? []).some(d => d.definitionTypeId === spec.definitionTypeId && (d.capabilities ?? []).includes(o.capabilityId)));
    if (output) node.children.push({id: `${id}-value`, kind: "value", source: {kind: "each", capabilityId: output.capabilityId, outputId: output.outputId}});
    return node;
  }
  if (spec?.kind === "value") {
    const node = spec.source ? {id: freshId(root, "value"), kind: "value", source: copy(spec.source)} : newNode("value", root, ruleset, {parentId, target});
    if (!node) return null;
    const inRepeater = Boolean(locate(root, parentId)?.path.some(entry => entry.kind === "repeater"));
    if (spec.display === "gauge" && !inRepeater) node.source = gaugeSource(ruleset) ?? node.source;
    if (spec.display) node.display = spec.display;
    return node;
  }
  return spec?.kind ? newNode(spec.kind, root, ruleset, {parentId, target}) : null;
}

/** Content Types whose Contents are an Actor's Items (not the Actor-backed ones). */
export const itemContentTypes = ruleset => (ruleset.contentTypes ?? []).filter(type => enabled(type) && type.storageKind !== "actor");

function edit(root, fn) { const next = copy(root); fn(next); return next; }

/** Add a node as the last child of a container, or next to a leaf in that leaf's container (before it when asked);
   beside: next to the target even when it is a container that would take the node. */
export function insertNode(root, targetId, node, {before = false, beside = false} = {}) {
  return edit(root, next => {
    const target = locate(next, targetId) ?? locate(next, next.id);
    if (!beside && isContainer(target.node) && childKinds(target.node).includes(node.kind)) target.node.children.push(node);
    else if (target.parent && childKinds(target.parent).includes(node.kind)) target.parent.children.splice(target.index + (before ? 0 : 1), 0, node);
    else throw new Error(`A ${node.kind} cannot go there.`);
  });
}
export function removeNode(root, id) {
  if (root.id === id) return root;
  return edit(root, next => { const found = locate(next, id); found.parent.children.splice(found.index, 1); if (found.parent.kind === "tabs" && !found.parent.children.length) { const tabs = locate(next, found.parent.id); if (tabs.parent) tabs.parent.children.splice(tabs.index, 1); } });
}
/** One step up (-1) or down (+1) among its siblings. */
export function moveNode(root, id, step) {
  return edit(root, next => {
    const found = locate(next, id); if (!found?.parent) return;
    const to = found.index + step; if (to < 0 || to >= found.parent.children.length) return;
    const [node] = found.parent.children.splice(found.index, 1); found.parent.children.splice(to, 0, node);
  });
}
/** Whether a node (new or moved) may go at targetId: into it when it is a container that accepts it, else next to it. */
export function canPlace(root, node, targetId, {beside = false} = {}) {
  const target = locate(root, targetId);
  if (!node || !target) return false;
  const holder = !beside && isContainer(target.node) && childKinds(target.node).includes(node.kind) ? target.node : target.parent;
  if (!holder || !childKinds(holder).includes(node.kind)) return false;
  // An "each" value only exists in a repeater; held Contents are never once per row.
  const inRepeater = [...(holder === target.node ? target.path : target.path.slice(0, -1))].some(entry => entry.kind === "repeater");
  // Inside the node itself, a list it holds counts too: a new list's row value is in that list.
  const fits = (entry, listed) => !(entry.source?.kind === "each" && !listed || entry.kind === "contents" && listed)
    && (entry.children ?? []).every(child => fits(child, listed || entry.kind === "repeater"));
  return fits(node, inRepeater);
}
/** Whether a block may be dragged onto another: not into itself, and only where its kind is accepted. */
export function canMoveInto(root, id, targetId, {beside = false} = {}) {
  const moving = locate(root, id), target = locate(root, targetId);
  if (!moving?.parent || !target || target.path.some(node => node.id === id)) return false;
  return canPlace(root, moving.node, targetId, {beside});
}
export function moveInto(root, id, targetId, {before = false, beside = false} = {}) {
  if (!canMoveInto(root, id, targetId, {beside})) return root;
  const node = copy(locate(root, id).node);
  return clampSpans(insertNode(removeNode(root, id), targetId, node, {before, beside}));
}
function* nodes(root) { if (!root) return; yield root; for (const child of root.children ?? []) yield* nodes(child); }

/** Change some properties of a node; columns shrink the spans of its children to fit. */
export function updateNode(root, id, changes) {
  return clampSpans(edit(root, next => {
    const {node} = locate(next, id);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null || value === "" && !["labelKey", "textKey", "src"].includes(key)) delete node[key];
      else node[key] = copy(value);
    }
  }));
}
function clampSpans(root) {
  return edit(root, next => {
    for (const node of nodes(next)) for (const child of node.children ?? []) {
      const room = columnsOf(node);
      if (child.span > room) child.span = room;
      if (child.span === 1 || room === 1) delete child.span;
    }
  });
}

/** Whether a value's source may be written from a sheet (an output with a stored value, or a Content field). */
export function writableSource(source) {
  if (!LAYOUT_WRITABLE_SOURCES.includes(source?.kind)) return false;
  if (source.kind === "field") return true;
  const capabilityId = source.kind === "each" ? source.capabilityId : source.reference?.capabilityId, outputId = source.kind === "each" ? source.outputId : source.reference?.outputId;
  return EACH_OUTPUTS.some(o => o.capabilityId === capabilityId && o.outputId === outputId && o.writable);
}

/** The label a value shows when its node sets none: {label} (a Ruleset name) or {labelKey} (the module's words for an output). */
export function defaultValueLabel(source, ruleset, {contentTypeIds = []} = {}) {
  if (source?.kind === "output") return {label: ruleset.definitions?.find(d => d.id === source.reference.objectId)?.nameKey ?? source.reference.objectId};
  if (source?.kind === "each") return {labelKey: outputLabelKey(source.capabilityId, source.outputId)};
  if (source?.kind === "formula") return {label: ruleset.formulas?.find(f => f.id === source.formulaRef)?.nameKey ?? source.formulaRef};
  if (source?.kind === "parameter") return {label: ruleset.parameters?.find(p => p.id === source.parameterRef)?.nameKey ?? source.parameterRef};
  if (source?.kind === "content") return {label: ruleset.contentTypes?.find(t => t.id === source.contentTypeId)?.nameKey ?? source.contentTypeId};
  if (source?.kind === "field") return {label: contentFields(ruleset, contentTypeIds).find(f => f.id === source.fieldId)?.name ?? source.fieldId};
  return {label: ""};
}
export const outputLabelKey = (capabilityId, outputId) => { const part = outputId.split(".")[1]; return `RTA.Sheet.Output.${capabilityId[0].toUpperCase()}${capabilityId.slice(1)}${part[0].toUpperCase()}${part.slice(1)}`; };
/** The fields of the Content Types a sheet is for (all of them when none is chosen), first one of each id. */
export function contentFields(ruleset, contentTypeIds = []) {
  const seen = new Map();
  for (const type of (ruleset.contentTypes ?? []).filter(t => !contentTypeIds.length || contentTypeIds.includes(t.id))) for (const [id, field] of Object.entries(type.fields ?? {})) if (!seen.has(id)) seen.set(id, {...field, id, contentTypeId: type.id});
  return [...seen.values()];
}

/* Preview: the projection a played sheet would get, with sample values instead of an Actor's. */
const SAMPLE = {number: 10, integer: 10, boolean: true};
function previewValue(node, ruleset, row, contentTypeIds) {
  const source = node.source, view = {id: node.id, kind: "value", ...(node.span ? {span: node.span} : {}), ...(node.style ? {style: node.style} : {}), ...(node.gmOnly ? {gmOnly: true} : {}),
    ...(node.display ? {display: node.display} : {}), ...(node.dots ? {dots: node.dots} : {}), label: node.labelKey || "", write: node.write ? {operation: node.write.operation} : null};
  if (!view.label) Object.assign(view, defaultValueLabel(source, ruleset, {contentTypeIds}));
  let valueType = "number";
  if (source.kind === "output" || source.kind === "each") {
    const capabilityId = source.kind === "output" ? source.reference.capabilityId : source.capabilityId, outputId = source.kind === "output" ? source.reference.outputId : source.outputId;
    valueType = capabilityTypeRegistry.get(capabilityId)?.outputs?.[outputId]?.valueType ?? "number";
    if (capabilityId === "pool" && outputId === "pool.current") view.maximum = 12;

  } else if (source.kind === "formula") valueType = ruleset.formulas?.find(f => f.id === source.formulaRef)?.resultType ?? "number";
  else if (source.kind === "parameter") {
    const parameter = ruleset.parameters?.find(p => p.id === source.parameterRef);
    valueType = parameter?.valueType ?? "number";
    if (parameter && parameter.value !== undefined) return {...view, valueType, value: parameter.value};
  } else if (source.kind === "content") {
    // The first Content of that type stands for the one an Actor would hold.
    const template = (ruleset.contentTemplates ?? []).find(t => enabled(t) && t.contentTypeId === source.contentTypeId);
    return {...view, valueType: "string", value: template?.nameKey ?? "…"};
  } else valueType = contentFields(ruleset, contentTypeIds).find(f => f.id === source.fieldId)?.valueType ?? "text";
  // Dots and gauges show a part filled: 3 of 5 dots, 10 of 20 on a gauge.
  if (node.display === "dots" && ["number", "integer"].includes(valueType)) return {...view, valueType, value: 3};
  if (node.display === "gauge" && view.maximum === undefined) view.maximum = 20;
  return {...view, valueType, value: SAMPLE[valueType] ?? (["string", "text"].includes(valueType) ? "…" : null)};
}

export function previewView(root, ruleset, {target = "actor", contentTypeIds = []} = {}) {
  const walk = (node, row) => {
    const base = {id: node.id, kind: node.kind, ...(node.span ? {span: node.span} : {}), ...(node.style ? {style: node.style} : {}), ...(node.gmOnly ? {gmOnly: true} : {})};
    if (node.kind === "value") return previewValue(node, ruleset, row, contentTypeIds);
    if (node.kind === "image") return {...base, src: node.src, fit: node.fit ?? "cover", height: node.height ?? "medium", ...(node.shape ? {shape: node.shape} : {})};
    if (node.kind === "text") return {...base, text: node.textKey};
    if (node.kind === "spacer") return base;
    if (node.kind === "contents") {
      // One Content of each listed type stands for what an Actor would hold.
      const types = itemContentTypes(ruleset).filter(type => !(node.contentTypeIds ?? []).length || node.contentTypeIds.includes(type.id));
      const rows = types.slice(0, 3).flatMap(type => (ruleset.contentTemplates ?? []).filter(t => enabled(t) && t.contentTypeId === type.id).slice(0, 1)
        .map(template => ({key: template.id, label: template.nameKey ?? template.id, img: template.image ?? "", item: true, available: true, type: type.nameKey ?? type.id})));
      return {...base, rows};
    }
    if (node.kind === "action") return {...base, label: node.labelKey || ruleset.actions?.find(a => a.id === node.actionRef)?.nameKey || node.actionRef, actionId: node.actionRef, definitionId: row?.id ?? null};
    if (node.kind === "repeater") {
      // Two Definitions of the type stand for what an Actor would hold.
      const type = ruleset.definitionTypes?.find(t => t.id === node.query?.definitionTypeId);
      const held = (ruleset.definitions ?? []).filter(d => enabled(d) && d.definitionTypeId === node.query?.definitionTypeId).slice(0, 2);
      if (!held.length) held.push({id: "", nameKey: type?.nameKey ?? node.query?.definitionTypeId ?? ""});
      return {...base, columns: node.columns, rows: held.map(definition => ({definitionId: definition.id, label: definition.nameKey ?? definition.id, children: node.children.map(child => walk(child, definition))}))};
    }
    return {...base, ...(node.columns ? {columns: node.columns} : {}), ...(node.labelKey !== undefined ? {label: node.labelKey} : {}), children: (node.children ?? []).map(child => walk(child, row))};
  };
  return {sheetId: "preview", target, root: walk(root, null)};
}
