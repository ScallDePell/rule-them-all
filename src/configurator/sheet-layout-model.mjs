/* The sheet editor's model: pure operations on a LayoutNode tree (layout-contract.mjs) and the preview the
   editor shows. The preview goes through the same markup as a played sheet (ui/sheet-markup.mjs), with sample
   values, so what the editor shows is the sheet the players get. Every operation returns a new tree. */
import {capabilityTypeRegistry} from "./capability-type-registry.mjs";
import {CARD_EXCLUDED_KINDS, LAYOUT_CONTAINERS, LAYOUT_COUNTED_DISPLAYS, LAYOUT_DOCUMENT_KINDS, LAYOUT_WRITABLE_SOURCES, layoutTarget} from "./layout-contract.mjs";
import {descriptionScale, scaleWords} from "./rule-contracts.mjs";

const copy = value => structuredClone(value);
const enabled = entry => entry?.enabled !== false;
/** A Content Type or Definition Type the GM leaves out of the sheet editor's palette ("Proposé dans l'éditeur de feuilles"
    unticked); blocks already placed with it keep working. */
export const offeredInSheets = type => type?.sheetPalette !== false;
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
export const childKinds = parent => !isContainer(parent) ? [] : parent.kind === "tabs" ? ["tab"] : ["section", "grid", "tabs", "repeater", "value", "action", "text", "image", "contents", "progression", "notes", "separator", "name", "portrait", "token", "spacer"];
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
  if (kind === "separator") return {id, kind};
  if (kind === "notes") {
    // The Actor's own text (notes, background): not on an Item sheet, not once per row of a list.
    const parent = locate(root, parentId);
    return target === "item" || parent?.path.some(node => node.kind === "repeater") ? null : {id, kind, write: {operation: "set"}};
  }
  if (LAYOUT_DOCUMENT_KINDS.includes(kind)) {
    // The Document's name and pictures: not once per row of a list; a token is an Actor's.
    const parent = locate(root, parentId);
    if (parent?.path.some(node => node.kind === "repeater") || kind === "token" && target === "item") return null;
    return kind === "portrait" ? {id, kind, shape: "portrait"} : kind === "token" ? {id, kind, shape: "circle", height: "small"} : {id, kind};
  }
  if (kind === "contents") {
    // An Actor's Items: not on an Item sheet, not once per row of a list.
    const parent = locate(root, parentId);
    if (target === "item" || parent?.path.some(node => node.kind === "repeater") || !itemContentTypes(ruleset).length) return null;
    return {id, kind};
  }
  if (kind === "progression") {
    // What the Actor buys: not on an Item sheet, not once per row of a list.
    const system = (ruleset.progressionSystems ?? []).find(enabled), parent = locate(root, parentId);
    return system && target !== "item" && !parent?.path.some(node => node.kind === "repeater") ? {id, kind, progressionSystemRef: system.id} : null;
  }
  return {id, kind: "spacer"};
}

/** What the editor offers to add, grouped: layout blocks, the Document's own (its name, its portrait, an Actor's token image),
   fields (a value, a gauge, dots, an Action button, the held Contents, each Progression System), a list per Definition family,
   and on an Actor sheet the Content it holds of each type (its Origin…); on an Item sheet, the Content fields.
   A Content Type or Definition Type the GM does not offer in the sheet editor (offeredInSheets) is left out. Each item: {label | labelKey, kind, spec}; paletteNode turns a spec into a node.
   A single Definition, Formula or Action is chosen in the block's settings once it is placed. */
export function paletteGroups(ruleset, {target = "actor", contentTypeIds = []} = {}) {
  const groups = [], name = entry => entry.nameKey ?? entry.id;
  groups.push({id: "layout", labelKey: "RTA.SheetEditor.Palette.Layout", items: ["section", "grid", "tabs", "text", "image", "separator", "spacer"].map(kind => ({kind, spec: {kind}}))});
  groups.push({id: "document", labelKey: "RTA.SheetEditor.Palette.Document", items: ["name", "portrait", ...(target === "actor" ? ["token"] : [])].map(kind => ({kind, spec: {kind}}))});
  const fields = [
    {kind: "value", labelKey: "RTA.SheetEditor.Kind.value", spec: {kind: "value"}},
    ...(target === "actor" ? [{kind: "gauge", labelKey: "RTA.SheetEditor.Display.gauge", spec: {kind: "value", display: "gauge"}}, {kind: "dots", labelKey: "RTA.SheetEditor.Display.dots", spec: {kind: "value", display: "dots"}},
      {kind: "boxes", labelKey: "RTA.SheetEditor.Display.boxes", spec: {kind: "value", display: "boxes"}}, {kind: "clock", labelKey: "RTA.SheetEditor.Display.clock", spec: {kind: "value", display: "clock"}},
      {kind: "notes", spec: {kind: "notes"}}] : []),
    ...((ruleset.actions ?? []).some(enabled) ? [{kind: "action", spec: {kind: "action"}}] : []),
    ...(target === "actor" && itemContentTypes(ruleset).some(offeredInSheets) ? [{kind: "contents", spec: {kind: "contents"}}] : []),
    ...(target === "actor" ? (ruleset.progressionSystems ?? []).filter(enabled).map(system => ({label: name(system), kind: "progression", spec: {kind: "progression", progressionSystemRef: system.id}})) : [])];
  groups.push({id: "fields", labelKey: "RTA.SheetEditor.Palette.Fields", items: fields});
  if (target === "item") {
    // A sheet for every Content Type offers the fields of those offered in the sheet editor; one that names its types, theirs.
    const offered = contentTypeIds.length ? contentTypeIds : (ruleset.contentTypes ?? []).filter(offeredInSheets).map(type => type.id);
    const contentFieldList = offered.length ? contentFields(ruleset, offered) : [];
    if (contentFieldList.length) groups.push({id: "content-fields", labelKey: "RTA.SheetEditor.Palette.ContentFields", items: contentFieldList.map(field => ({label: field.name ?? field.id, kind: "value", spec: {kind: "value", source: {kind: "field", fieldId: field.id}}}))});
    return [...groups, ...templateGroup(ruleset, target)];
  }
  const families = (ruleset.definitionTypes ?? []).filter(type => enabled(type) && offeredInSheets(type) && (ruleset.definitions ?? []).some(d => enabled(d) && d.definitionTypeId === type.id));
  if (families.length) groups.push({id: "families", labelKey: "RTA.SheetEditor.Palette.Families", items: families.map(type => ({label: name(type), kind: "repeater", spec: {kind: "repeater", definitionTypeId: type.id}}))});
  const held = (ruleset.contentTypes ?? []).filter(type => enabled(type) && offeredInSheets(type));
  if (held.length) groups.push({id: "held", labelKey: "RTA.SheetEditor.Palette.Held", items: held.map(type => ({label: name(type), kind: "content", spec: {kind: "value", source: {kind: "content", contentTypeId: type.id}}}))});
  return [...groups, ...templateGroup(ruleset, target)];
}

/** The "Modèles" group: the Ruleset's block templates this sheet can take (none showing what only the other kind of sheet
    has), less those that name a type the GM does not offer in the sheet editor. Each item is a template (renamed,
    exported or deleted from the palette); an empty group still shows, so a template can be imported. */
function templateGroup(ruleset, target) {
  const types = [...(ruleset.contentTypes ?? []), ...(ruleset.definitionTypes ?? [])], hidden = id => types.some(type => type.id === id && !offeredInSheets(type));
  const offered = template => ![...nodes(template.root)].some(node => hidden(node.query?.definitionTypeId) || hidden(node.source?.contentTypeId) || (node.contentTypeIds ?? []).some(hidden));
  const items = (ruleset.sheetTemplates ?? []).filter(template => enabled(template) && [target, "any"].includes(layoutTarget(template.root)) && offered(template))
    .map(template => ({label: template.nameKey || template.id, kind: "template", template: template.id, spec: {kind: "template", templateId: template.id}}));
  return [{id: "templates", labelKey: "RTA.SheetTemplate.Palette", items}];
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
  if (spec?.kind === "progression" && spec.progressionSystemRef) {
    const node = newNode("progression", root, ruleset, {parentId, target});
    return node && {...node, progressionSystemRef: spec.progressionSystemRef};
  }
  if (spec?.kind === "value") {
    const node = spec.source ? {id: freshId(root, "value"), kind: "value", source: copy(spec.source)} : newNode("value", root, ruleset, {parentId, target});
    if (!node) return null;
    const inRepeater = Boolean(locate(root, parentId)?.path.some(entry => entry.kind === "repeater"));
    if (spec.display === "gauge" && !inRepeater) node.source = gaugeSource(ruleset) ?? node.source;
    if (spec.display) node.display = spec.display;
    // A clock starts with 4 segments (a short task); the count changes in its settings.
    if (spec.display === "clock") node.dots = 4;
    return node;
  }
  // A template: a copy of its block, to know where it may go (sheet-templates.mjs insertTemplate gives it its ids).
  if (spec?.kind === "template") { const template = (ruleset.sheetTemplates ?? []).find(entry => entry.id === spec.templateId); return template ? copy(template.root) : null; }
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
  const fits = (entry, listed) => !(entry.source?.kind === "each" && !listed || ["contents", "progression", "notes", ...LAYOUT_DOCUMENT_KINDS].includes(entry.kind) && listed)
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
      if (value === undefined || value === null || value === "" && !["labelKey", "textKey", "src"].includes(key) || value === "" && key === "src" && node.kind === "separator" && node.look !== "image") delete node[key];
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
function previewValue(node, ruleset, row, contentTypeIds, viewer = null, base = {id: node.id, kind: "value"}) {
  const source = node.source, view = {...base,
    ...(node.display ? {display: node.display} : {}), ...(node.dots ? {dots: node.dots} : {}), label: node.labelKey || "", write: node.write && !(viewer && viewer !== "gm" && node.write.by === "gm") ? {operation: node.write.operation} : null};
  if (!view.label) Object.assign(view, defaultValueLabel(source, ruleset, {contentTypeIds}));
  let valueType = "number";
  if (source.kind === "output" || source.kind === "each") {
    const capabilityId = source.kind === "output" ? source.reference.capabilityId : source.capabilityId, outputId = source.kind === "output" ? source.reference.outputId : source.outputId;
    valueType = capabilityTypeRegistry.get(capabilityId)?.outputs?.[outputId]?.valueType ?? "number";
    if (capabilityId === "pool" && outputId === "pool.current") view.maximum = 12;
    if (node.tooltip?.description) { const text = ruleset.definitions?.find(d => d.id === (source.kind === "output" ? source.reference.objectId : row?.id))?.descriptionKey; if (text) view.tooltip = {text}; }
    // A description shows the words of the Definition's scale (its own, else its type's) for a high value.
    if (node.display === "description") {
      const scale = descriptionScale(ruleset, source.kind === "output" ? source.reference.objectId : row?.id);
      const {maximum, ...shown} = view;
      const top = scale ? [...scale.rows].sort((a, b) => (b.min ?? -Infinity) - (a.min ?? -Infinity))[0]?.labelKey : null;
      return {...shown, valueType: "string", value: scaleWords(scale, 12, 12) ?? top ?? "RTA.SheetEditor.DescriptionSample"};
    }

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
  // Dots, boxes and clocks show a part filled (3 of 5 dots), a gauge 10 of 20.
  if (LAYOUT_COUNTED_DISPLAYS.includes(node.display) && ["number", "integer"].includes(valueType)) return {...view, valueType, value: 3};
  if (node.display === "gauge" && view.maximum === undefined) view.maximum = 20;
  return {...view, valueType, value: SAMPLE[valueType] ?? (["string", "text"].includes(valueType) ? "…" : null)};
}

/** A Progression System as the sheet shows it, with sample rows: two Definitions per advancement (raised from 2 to 3 for
    10 of its currency, the second already at its maximum), then its first milestones, one reached and the next one ahead.
    An observer reads it without the buttons (by default only the owners and the GM write). */
function previewProgression(node, ruleset, viewer = null) {
  const buy = viewer !== "observer";
  const system = (ruleset.progressionSystems ?? []).find(entry => entry.id === node.progressionSystemRef);
  const name = id => ruleset.definitions?.find(d => d.id === id)?.nameKey ?? id;
  const advancements = (system?.advancements ?? []).map(advancement => {
    const targets = (ruleset.definitions ?? []).filter(d => enabled(d) && ((advancement.definitionIds ?? []).includes(d.id) || d.definitionTypeId === advancement.definitionTypeId)).slice(0, 2);
    return {id: advancement.id, label: advancement.labelKey || advancement.id, currency: name(advancement.currencyRef?.objectId ?? ""), funds: 25,
      rows: targets.map((d, i) => ({definitionId: d.id, label: d.nameKey ?? d.id, current: 2, next: 3, cost: 10, buy, ...(i && buy ? {reason: "maximum"} : {})}))};
  }).filter(advancement => advancement.rows.length);
  const milestones = (system?.milestones ?? []).slice(0, 2).map((milestone, i) => ({id: milestone.id, label: milestone.labelKey || milestone.id, state: i ? "ahead" : "reached"}));
  return {systemId: system?.id ?? "", advancements, milestones, apply: buy && milestones.length > 0};
}

/** viewer: "player", "observer" or "gm" previews the sheet as that person sees it (blocks not for them left out,
    values only the GM changes read-only for the others); null shows every block. */
/** A value of a card (a held Content shown in cards): a Content field reads that Content's value (a Reference by name);
    any other source shows its usual sample. A field the Content's type lacks is left out. */
function previewCardValue(node, ruleset, card, viewer, base) {
  const view = previewValue(node, ruleset, null, [], viewer, base);
  if (node.source?.kind !== "field") return view;
  const field = card.type?.fields?.[node.source.fieldId];
  if (!field) return null;
  const raw = card.fields?.[node.source.fieldId] ?? null, values = Array.isArray(raw) ? raw : raw === null ? [] : [raw];
  const text = item => item && typeof item === "object" ? ruleset[String(item.objectKind ?? "").replace(/y$/, "ie") + "s"]?.find(entry => entry.id === item.objectId)?.nameKey ?? item.objectId : item;
  const value = field.valueType === "reference" || Array.isArray(raw) ? (values.length ? values.map(text).join(", ") : null) : raw;
  return {...view, write: null, label: node.labelKey || field.name || node.source.fieldId, valueType: field.valueType === "reference" || Array.isArray(raw) ? "string" : field.valueType, value};
}

export function previewView(root, ruleset, {target = "actor", contentTypeIds = [], viewer = null, header = "standard", theme = null} = {}) {
  const walk = (node, row, card = null) => {
    if (card && CARD_EXCLUDED_KINDS.includes(node.kind)) return null;
    if (viewer && node.seenBy && !node.seenBy.includes(viewer)) return null;
    // A block under a Condition is shown (dimmed by the editor): the Actor it applies to is not known here.
    const base = {id: node.id, kind: node.kind, ...(node.span ? {span: node.span} : {}), ...(node.rowSpan ? {rowSpan: node.rowSpan} : {}), ...(node.width ? {width: node.width} : {}),
      ...(node.style ? {style: node.style} : {}), ...(node.seenBy ? {seenBy: node.seenBy} : {}), ...(node.visibleIf ? {visibleIf: node.visibleIf} : {}), ...(node.icon ? {icon: node.icon} : {}), ...(node.labelShow ? {labelShow: node.labelShow} : {}),
      ...(node.tooltip?.text ? {tooltip: {text: node.tooltip.text}} : {}), ...(node.collapsible ? {collapsible: true} : {}), ...(node.overlay ? {overlay: node.overlay} : {}),
      ...(node.clickActionRef ? {click: {actionId: node.clickActionRef, definitionId: row?.id ?? null}} : {})};
    if (node.kind === "value") return card ? previewCardValue(node, ruleset, card, viewer, base) : previewValue(node, ruleset, row, contentTypeIds, viewer, base);
    if (node.kind === "image") return {...base, src: node.src, fit: node.fit ?? "cover", height: node.height ?? "medium", ...(node.shape ? {shape: node.shape} : {})};
    // The Document's name and pictures: the editor shows samples (renderLayoutPreviewHTML).
    if (node.kind === "portrait" || node.kind === "token") return {...base, fit: node.fit ?? "cover", height: node.height ?? "medium", ...(node.shape ? {shape: node.shape} : {}), ...(node.updatePlaced ? {updatePlaced: true} : {})};
    if (node.kind === "name") return base;
    if (node.kind === "text") return {...base, text: node.textKey, ...(node.values ? {values: Object.fromEntries(Object.entries(node.values).map(([name, source]) => [name, previewValue({id: node.id, kind: "value", source}, ruleset, row, contentTypeIds).value]))} : {})};
    if (node.kind === "spacer") return base;
    if (node.kind === "separator") return {...base, look: node.look ?? "line", ...(node.look === "image" ? {src: node.src ?? ""} : {})};
    if (node.kind === "notes") return {...base, label: node.labelKey || "", format: node.format ?? "plain", height: node.height ?? "medium", value: "", write: node.write && !(viewer && viewer !== "gm" && node.write.by === "gm") ? {operation: "set"} : null};
    if (node.kind === "contents") {
      // One Content of each listed type stands for what an Actor would hold.
      const types = itemContentTypes(ruleset).filter(type => !(node.contentTypeIds ?? []).length || node.contentTypeIds.includes(type.id));
      const rows = types.slice(0, 3).flatMap(type => (ruleset.contentTemplates ?? []).filter(t => enabled(t) && t.contentTypeId === type.id).slice(0, 1)
        .map(template => ({key: template.id, label: template.nameKey ?? template.id, img: template.image ?? "", item: true, available: true, type: type.nameKey ?? type.id})));
      if (!node.cards) return {...base, rows};
      // Cards: the sample Contents' own field values, in the card template or as the fields chosen.
      const template = node.cards.templateRef ? (ruleset.sheetTemplates ?? []).find(entry => entry.id === node.cards.templateRef) : null;
      for (const row of rows) {
        const content = (ruleset.contentTemplates ?? []).find(entry => entry.id === row.key), card = {type: (ruleset.contentTypes ?? []).find(type => type.id === content?.contentTypeId) ?? null, fields: content?.data ?? {}};
        if (template) row.children = [walk(template.root, null, card)].filter(Boolean);
        else row.fields = (node.cards.fieldIds ?? []).map(fieldId => previewCardValue({id: `${node.id}-${fieldId}`, kind: "value", source: {kind: "field", fieldId}}, ruleset, card, viewer)).filter(Boolean);
      }
      return {...base, rows, cards: template ? "template" : "fields"};
    }
    if (node.kind === "progression") return {...base, ...previewProgression(node, ruleset, viewer)};
    if (node.kind === "action") return {...base, label: node.labelKey || ruleset.actions?.find(a => a.id === node.actionRef)?.nameKey || node.actionRef, actionId: node.actionRef, definitionId: row?.id ?? null};
    if (node.kind === "repeater") {
      // Two Definitions of the type stand for what an Actor would hold.
      const type = ruleset.definitionTypes?.find(t => t.id === node.query?.definitionTypeId);
      const held = (ruleset.definitions ?? []).filter(d => enabled(d) && d.definitionTypeId === node.query?.definitionTypeId).slice(0, 2);
      if (!held.length) held.push({id: "", nameKey: type?.nameKey ?? node.query?.definitionTypeId ?? ""});
      return {...base, columns: node.columns, rows: held.map(definition => ({definitionId: definition.id, label: definition.nameKey ?? definition.id, children: node.children.map(child => walk(child, definition)).filter(Boolean)}))};
    }
    return {...base, ...(node.columns ? {columns: node.columns} : {}), ...(node.labelKey !== undefined ? {label: node.labelKey} : {}), children: (node.children ?? []).map(child => walk(child, row, card)).filter(Boolean)};
  };
  return {sheetId: "preview", target, header, ...(theme ? {theme} : {}), root: walk(root, null)};
}
