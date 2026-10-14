/* LayoutNode grammar (CP-14, closes CP-33 §8): what a SheetDefinition shows and where, as a tree of nodes.
   Constrained and declarative: no HTML, CSS, script or free x/y placement. Containers flow their children
   into columns; a child may span several of them. The renderer stacks the columns on a narrow sheet.

   SheetDefinition.root := node
   node      := tabs | tab | section | grid | repeater | value | action | text | image | contents | progression | spacer, each {id, span?}
   tabs      := {kind: "tabs", children: tab[]}                       one page per tab
   tab       := {kind: "tab", labelKey, children: node[]}              only inside tabs
   section   := {kind: "section", labelKey?, columns: 1-4, children}   a titled block
   grid      := {kind: "grid", columns: 1-6, children}                 an untitled block
   repeater  := {kind: "repeater", query, columns: 1-6, children}      its children once per Definition the query finds
   query     := {definitionTypeId, conditionRef?}                      held Definitions of that type (variables.each in the Condition)
   value     := {kind: "value", source, labelKey?, write?, display?, dots?}   a value shown, editable with write;
                display: "field" (default: the number or text, or its input) | "gauge" (a bar up to the maximum)
                | "dots" (one dot per point up to the maximum, or dots: 1-20 when the value has none)
                | "description" (the words of the Definition's description scale for its value or pool; the number is never sent)
   source    := {kind: "output", reference} | {kind: "formula", formulaRef} | {kind: "parameter", parameterRef}
              | {kind: "each", capabilityId, outputId, slotId?}        the output of the repeater's current Definition (its first slot by default)
              | {kind: "field", fieldId}                               a field of the Content an Item sheet shows
              | {kind: "content", contentTypeId}                       the name of the Content(s) the Actor holds of that type (its Origin…)
   write     := {operation: "set" | "add" | "subtract" | "adjust", by?: "gm"}  only on an output, each or field source (CP-30 WriteBinding);
                                                                       by "gm": players see the value but only the GM changes it;
                                                                       adjust: raised and lowered by 1 with − and + on each side;
                                                                       a value.final is written through its value.base
   action    := {kind: "action", actionRef, labelKey?}                 a button that uses the Action (on the repeater's Definition inside one)
   text      := {kind: "text", textKey}
   image     := {kind: "image", src, fit?: "cover" | "contain", height?: "small" | "medium" | "large", shape?}
                a picture (a banner, a logo, a portrait). shape: none fills the width (a banner), "rounded" the same with
                rounded corners; "square", "portrait" (3:4), "landscape" (4:3) and "circle" keep their proportions at that height
   contents  := {kind: "contents", contentTypeIds?}                  the Contents the Actor holds (its Items), of these Content Types (all when none);
                                                                       dropping an Item on the sheet adds one
   progression := {kind: "progression", progressionSystemRef}         on an Actor sheet, what the Actor buys with a Progression
                                                                       System: each Definition an advancement raises, its cost and
                                                                       the currency spent, a button per purchase; its milestones and
                                                                       a button that applies those reached. Never inside a repeater.
   spacer    := {kind: "spacer"}
   seenBy: on any node below the root, who gets it (and what it holds): some of "player" (an owner of the Actor),
           "observer" (anyone else who opens the sheet) and "gm"; all when absent. Nobody writes through a node they do not get.
   style: any node may carry one (colors, background, border, font, size, alignment, margins): layout-style-contract.mjs.
   icon, labelShow: a tab, section, value or action may show a Font Awesome icon ("fa-solid fa-heart"; fa-solid when no
           style is named). labelShow: "both" (the default with an icon), "icon" (the icon alone, its text kept for screen
           readers and as the tooltip) or "text" (the icon kept but not shown).
   span: 1 to the parent's columns (default 1). Node ids are unique in the sheet; the tree is at most 8 levels and 500 nodes deep. */

import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {IMAGE_PATH, SHEET_IMAGE_FITS, SHEET_IMAGE_HEIGHTS, prepareLayoutStyle} from "./layout-style-contract.mjs";

export const LAYOUT_CONTAINERS = Object.freeze(["tabs", "tab", "section", "grid", "repeater"]);
export const LAYOUT_LEAVES = Object.freeze(["value", "action", "text", "image", "contents", "progression", "spacer"]);
export const LAYOUT_NODE_KINDS = Object.freeze([...LAYOUT_CONTAINERS, ...LAYOUT_LEAVES]);
export const LAYOUT_SOURCE_KINDS = Object.freeze(["output", "formula", "parameter", "each", "field", "content"]);
export const LAYOUT_VALUE_DISPLAYS = Object.freeze(["field", "gauge", "dots", "description"]);
/** Who a sheet block is for: an owner of the Actor, anyone else who opens it, the GM. */
export const LAYOUT_AUDIENCES = Object.freeze(["player", "observer", "gm"]);
export const LAYOUT_IMAGE_SHAPES = Object.freeze(["rounded", "square", "portrait", "landscape", "circle"]);
export const LAYOUT_MAX_DOTS = 20;
/** Sources a sheet can write to. */
export const LAYOUT_WRITABLE_SOURCES = Object.freeze(["output", "each", "field"]);
export const LAYOUT_WRITE_OPERATIONS = Object.freeze(["set", "add", "subtract", "adjust"]);
/** Blocks whose label may carry an icon, and how it shows. */
export const LAYOUT_LABELLED = Object.freeze(["tab", "section", "value", "action"]);
export const LAYOUT_LABEL_SHOWS = Object.freeze(["text", "both", "icon"]);
const FA_STYLES = ["fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin", "fa-duotone"];
/** "fa-heart" or "fa-regular fa-heart" as the classes to render ("fa-solid fa-heart"); null when it names no icon. */
export function iconClasses(icon) {
  const parts = String(icon ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 3 || !parts.every(part => /^fa-[a-z0-9-]+$/.test(part))) return null;
  const glyphs = parts.filter(part => !FA_STYLES.includes(part));
  if (glyphs.length !== 1) return null;
  return [parts.find(part => FA_STYLES.includes(part)) ?? "fa-solid", glyphs[0]].join(" ");
}
export const LAYOUT_MAX_DEPTH = 8;
export const LAYOUT_MAX_NODES = 500;
const MAX_COLUMNS = {section: 4, grid: 6, repeater: 6};
const FIELDS = {
  tabs: ["children"], tab: ["labelKey", "children"], section: ["labelKey", "columns", "children"], grid: ["columns", "children"],
  repeater: ["query", "columns", "children"], value: ["source", "labelKey", "write", "display", "dots"], action: ["actionRef", "labelKey"], text: ["textKey"], image: ["src", "fit", "height", "shape"], contents: ["contentTypeIds"], progression: ["progressionSystemRef"], spacer: []
};
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function prepareSource(source, path, inRepeater) {
  if (!isRecord(source) || !LAYOUT_SOURCE_KINDS.includes(source.kind)) throw new Error(`${path}.kind must be ${LAYOUT_SOURCE_KINDS.join(", ")}.`);
  const only = keys => { for (const key of Object.keys(source)) if (!["kind", ...keys].includes(key)) throw new Error(`${path} contains unsupported field: ${key}.`); };
  if (source.kind === "output") {
    only(["reference"]);
    const r = source.reference;
    if (!isRecord(r) || r.objectKind !== "definition" || !nonempty(r.objectId) || !nonempty(r.capabilityId) || !nonempty(r.outputId)) throw new Error(`${path}.reference must name a Definition output.`);
  } else if (source.kind === "formula") { only(["formulaRef"]); if (!nonempty(source.formulaRef)) throw new Error(`${path}.formulaRef must be an id.`); }
  else if (source.kind === "parameter") { only(["parameterRef"]); if (!nonempty(source.parameterRef)) throw new Error(`${path}.parameterRef must be an id.`); }
  else if (source.kind === "field") { only(["fieldId"]); if (!nonempty(source.fieldId)) throw new Error(`${path}.fieldId must be an id.`); }
  else if (source.kind === "content") { only(["contentTypeId"]); if (!nonempty(source.contentTypeId)) throw new Error(`${path}.contentTypeId must be an id.`); }
  else {
    only(["capabilityId", "outputId", "slotId"]);
    if (!inRepeater) throw new Error(`${path}: an "each" value only exists inside a repeater.`);
    if (!nonempty(source.capabilityId) || !nonempty(source.outputId)) throw new Error(`${path} needs a capabilityId and an outputId.`);
  }
  return copyJSON(source);
}

/** The checked layout tree; throws on the first error with its path (root.children[2].source…). */
export function prepareLayout(root) {
  const ids = new Set();
  let count = 0;
  const walk = (node, path, depth, parent, inRepeater) => {
    if (!isRecord(node)) throw new Error(`${path} must be a layout node.`);
    if (!LAYOUT_NODE_KINDS.includes(node.kind)) throw new Error(`${path}.kind must be ${LAYOUT_NODE_KINDS.join(", ")}.`);
    if (!NODE_ID.test(node.id ?? "")) throw new Error(`${path}.id must be letters, digits, - or _.`);
    if (ids.has(node.id)) throw new Error(`${path}: the node id ${node.id} is used twice.`);
    ids.add(node.id);
    if (++count > LAYOUT_MAX_NODES) throw new Error(`A sheet has at most ${LAYOUT_MAX_NODES} nodes.`);
    if (depth > LAYOUT_MAX_DEPTH) throw new Error(`${path}: a sheet is at most ${LAYOUT_MAX_DEPTH} levels deep.`);
    for (const key of Object.keys(node)) if (!["id", "kind", "span", "style", "seenBy", ...(LAYOUT_LABELLED.includes(node.kind) ? ["icon", "labelShow"] : []), ...FIELDS[node.kind]].includes(key)) throw new Error(`${path} contains unsupported field: ${key}.`);
    if ((node.kind === "tab") !== (parent?.kind === "tabs")) throw new Error(node.kind === "tab" ? `${path}: a tab belongs in tabs.` : `${path}: tabs hold only tabs.`);
    const next = {id: node.id, kind: node.kind};
    const parentColumns = parent && MAX_COLUMNS[parent.kind] ? parent.columns : 1;
    if (node.span !== undefined) {
      if (!Number.isSafeInteger(node.span) || node.span < 1 || node.span > parentColumns) throw new Error(`${path}.span must be between 1 and ${parentColumns}.`);
      if (node.span > 1) next.span = node.span;
    }
    if (node.seenBy !== undefined) {
      if (!parent) throw new Error(`${path}: the root is seen by all.`);
      if (!Array.isArray(node.seenBy) || !node.seenBy.length || !node.seenBy.every(who => LAYOUT_AUDIENCES.includes(who))) throw new Error(`${path}.seenBy must list some of ${LAYOUT_AUDIENCES.join(", ")}.`);
      const seenBy = LAYOUT_AUDIENCES.filter(who => node.seenBy.includes(who));
      if (seenBy.length < LAYOUT_AUDIENCES.length) next.seenBy = seenBy;
    }
    if (MAX_COLUMNS[node.kind]) {
      const columns = node.columns ?? 1;
      if (!Number.isSafeInteger(columns) || columns < 1 || columns > MAX_COLUMNS[node.kind]) throw new Error(`${path}.columns must be between 1 and ${MAX_COLUMNS[node.kind]}.`);
      next.columns = columns;
    }
    if (["tab", "section"].includes(node.kind) || node.labelKey !== undefined && ["value", "action"].includes(node.kind)) {
      if (node.labelKey !== undefined && typeof node.labelKey !== "string") throw new Error(`${path}.labelKey must be text.`);
      next.labelKey = node.labelKey ?? "";
    }
    if (node.icon !== undefined && node.icon !== "") {
      const icon = iconClasses(node.icon);
      if (!icon) throw new Error(`${path}.icon must be a Font Awesome icon, such as fa-solid fa-heart.`);
      next.icon = icon;
    }
    if (node.labelShow !== undefined) {
      if (!LAYOUT_LABEL_SHOWS.includes(node.labelShow)) throw new Error(`${path}.labelShow must be ${LAYOUT_LABEL_SHOWS.join(" or ")}.`);
      next.labelShow = node.labelShow;
    }
    if (node.kind === "repeater") {
      const query = node.query;
      if (!isRecord(query) || !nonempty(query.definitionTypeId)) throw new Error(`${path}.query needs a definitionTypeId.`);
      for (const key of Object.keys(query)) if (!["definitionTypeId", "conditionRef"].includes(key)) throw new Error(`${path}.query contains unsupported field: ${key}.`);
      if (query.conditionRef !== undefined && query.conditionRef !== null && !nonempty(query.conditionRef)) throw new Error(`${path}.query.conditionRef must be an id.`);
      next.query = {definitionTypeId: query.definitionTypeId, ...(nonempty(query.conditionRef) ? {conditionRef: query.conditionRef} : {})};
    }
    if (node.kind === "value") {
      next.source = prepareSource(node.source, `${path}.source`, inRepeater);
      if (node.write !== undefined && node.write !== null) {
        if (!isRecord(node.write) || !LAYOUT_WRITE_OPERATIONS.includes(node.write.operation) || Object.keys(node.write).some(key => !["operation", "by"].includes(key))
          || node.write.by !== undefined && node.write.by !== "gm") throw new Error(`${path}.write must be {operation: ${LAYOUT_WRITE_OPERATIONS.join(" | ")}, by?: "gm"}.`);
        if (!LAYOUT_WRITABLE_SOURCES.includes(next.source.kind)) throw new Error(`${path}: only a Definition output or a Content field can be written from a sheet.`);
        next.write = {operation: node.write.operation, ...(node.write.by ? {by: node.write.by} : {})};
      }
      if (node.display !== undefined && node.display !== "field") {
        if (!LAYOUT_VALUE_DISPLAYS.includes(node.display)) throw new Error(`${path}.display must be ${LAYOUT_VALUE_DISPLAYS.join(", ")}.`);
        next.display = node.display;
      }
      if (next.display === "description") {
        const capability = next.source.kind === "output" ? next.source.reference?.capabilityId : next.source.kind === "each" ? next.source.capabilityId : null;
        if (next.write || !["value", "pool"].includes(capability)) throw new Error(`${path}: a description shows the words of a Definition's scale; it reads a value or a pool and is never written.`);
      }
      if (node.dots !== undefined) {
        if (next.display !== "dots" || !Number.isSafeInteger(node.dots) || node.dots < 1 || node.dots > LAYOUT_MAX_DOTS) throw new Error(`${path}.dots must be 1 to ${LAYOUT_MAX_DOTS}, on a value shown as dots.`);
        next.dots = node.dots;
      }
    }
    if (node.kind === "action") { if (!nonempty(node.actionRef)) throw new Error(`${path}.actionRef must be an id.`); next.actionRef = node.actionRef; }
    if (node.kind === "progression") {
      if (!nonempty(node.progressionSystemRef)) throw new Error(`${path}.progressionSystemRef must be an id.`);
      if (inRepeater) throw new Error(`${path}: a progression is the Actor's, never once per row of a list.`);
      next.progressionSystemRef = node.progressionSystemRef;
    }
    if (node.kind === "text") { if (typeof node.textKey !== "string") throw new Error(`${path}.textKey must be text.`); next.textKey = node.textKey; }
    if (node.kind === "image") {
      // An image block without a picture yet is a draft: it shows nothing in play.
      if (typeof node.src !== "string" || node.src && !IMAGE_PATH.test(node.src)) throw new Error(`${path}.src must be a file path.`);
      next.src = node.src;
      if (node.fit !== undefined) { if (!SHEET_IMAGE_FITS.includes(node.fit)) throw new Error(`${path}.fit must be ${SHEET_IMAGE_FITS.join(" or ")}.`); next.fit = node.fit; }
      if (node.height !== undefined) { if (!SHEET_IMAGE_HEIGHTS[node.height]) throw new Error(`${path}.height must be ${Object.keys(SHEET_IMAGE_HEIGHTS).join(", ")}.`); next.height = node.height; }
      if (node.shape !== undefined) { if (!LAYOUT_IMAGE_SHAPES.includes(node.shape)) throw new Error(`${path}.shape must be ${LAYOUT_IMAGE_SHAPES.join(" or ")}.`); next.shape = node.shape; }
    }
    const style = prepareLayoutStyle(node.style, node.kind, `${path}.style`, {containers: LAYOUT_CONTAINERS});
    if (style) next.style = style;
    if (node.kind === "contents" && node.contentTypeIds !== undefined) {
      if (!Array.isArray(node.contentTypeIds) || !node.contentTypeIds.every(nonempty)) throw new Error(`${path}.contentTypeIds must be a list of ids.`);
      if (node.contentTypeIds.length) next.contentTypeIds = [...new Set(node.contentTypeIds)];
    }
    if (LAYOUT_CONTAINERS.includes(node.kind)) {
      if (!Array.isArray(node.children)) throw new Error(`${path}.children must be a list.`);
      next.children = node.children.map((child, i) => walk(child, `${path}.children[${i}]`, depth + 1, next, inRepeater || node.kind === "repeater"));
    }
    return next;
  };
  return walk(root, "root", 1, null, false);
}

/** Every node of a tree, depth first, with its path. */
export function* layoutNodes(root, path = "root") {
  if (!isRecord(root)) return;
  yield {node: root, path};
  for (const [i, child] of (root.children ?? []).entries()) yield* layoutNodes(child, `${path}.children[${i}]`);
}
/** An empty sheet: one grid. */
export const emptyLayout = () => ({id: "root", kind: "grid", columns: 1, children: []});
