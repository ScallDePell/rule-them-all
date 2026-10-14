/* LayoutNode grammar (CP-14, closes CP-33 §8): what a SheetDefinition shows and where, as a tree of nodes.
   Constrained and declarative: no HTML, CSS, script or free x/y placement. Containers flow their children
   into columns; a child may span several of them. The renderer stacks the columns on a narrow sheet.

   SheetDefinition.root := node
   node      := tabs | tab | section | grid | repeater | value | action | text | image | contents | progression | notes | separator
              | name | portrait | token | spacer, each {id, span?, rowSpan?, width?, visibleIf?, tooltip?}
   tabs      := {kind: "tabs", children: tab[]}                       one page per tab
   tab       := {kind: "tab", labelKey, children: node[]}              only inside tabs
   section   := {kind: "section", labelKey?, columns: 1-4, collapsible?: true, overlay?, children}   a titled block;
                collapsible: its title folds and unfolds it (each user's client remembers it folded)
   grid      := {kind: "grid", columns: 1-6, overlay?, children}       an untitled block
   overlay   := "top" | "center" | "bottom"                            its blocks stacked in one cell, one over the other
                (a value over a picture), placed at the top, centre or bottom; across by each block's alignment
   repeater  := {kind: "repeater", query, columns: 1-6, children}      its children once per Definition the query finds
   query     := {definitionTypeId, conditionRef?}                      held Definitions of that type (variables.each in the Condition)
   value     := {kind: "value", source, labelKey?, write?, display?, dots?}   a value shown, editable with write;
                display: "field" (default: the number or text, or its input) | "gauge" (a bar up to the maximum)
                | "dots" (one dot per point up to the maximum, or dots: 1-20 when the value has none)
                | "description" (the words of the Definition's description scale for its value or pool; the number is never sent)
                | "boxes" (square boxes, like dots: stress, wounds) | "clock" (a circle cut into one segment per point)
   source    := {kind: "output", reference} | {kind: "formula", formulaRef} | {kind: "parameter", parameterRef}
              | {kind: "each", capabilityId, outputId, slotId?}        the output of the repeater's current Definition (its first slot by default)
              | {kind: "field", fieldId}                               a field of the Content an Item sheet shows
              | {kind: "content", contentTypeId}                       the name of the Content(s) the Actor holds of that type (its Origin…)
   write     := {operation: "set" | "add" | "subtract" | "adjust", by?: "gm"}  only on an output, each or field source (CP-30 WriteBinding);
                                                                       by "gm": players see the value but only the GM changes it;
                                                                       adjust: raised and lowered by 1 with − and + on each side;
                                                                       a value.final is written through its value.base
   action    := {kind: "action", actionRef, labelKey?}                 a button that uses the Action (on the repeater's Definition inside one)
   text      := {kind: "text", textKey, values?}                       values: {name: source} (output, formula, parameter, each);
                                                                       "{name}" in the text shows that value
   clickActionRef: on a value, a text, an image or a list (each row by its name), the Action a click on it uses: a Test
                rolled from a skill's name (in a list, on the row's Definition)
   image     := {kind: "image", src, fit?: "cover" | "contain", height?: "small" | "medium" | "large", shape?}
                a picture (a banner, a logo, a portrait). shape: none fills the width (a banner), "rounded" the same with
                rounded corners; "square", "portrait" (3:4), "landscape" (4:3) and "circle" keep their proportions at that height
   contents  := {kind: "contents", contentTypeIds?}                  the Contents the Actor holds (its Items), of these Content Types (all when none);
                                                                       dropping an Item on the sheet adds one
   progression := {kind: "progression", progressionSystemRef}         on an Actor sheet, what the Actor buys with a Progression
                                                                       System: each Definition an advancement raises, its cost and
                                                                       the currency spent, a button per purchase; its milestones and
                                                                       a button that applies those reached. Never inside a repeater.
   notes     := {kind: "notes", labelKey?, format?: "rich", height?: "small" | "medium" | "large", write?: {operation: "set", by?: "gm"}}
                a text of several lines kept on the Actor (notes, background), by node id: plain text, or rich text
                (Foundry's editor: bold, links, @UUID, inline rolls); written like a value, through the runtime
   separator := {kind: "separator", look?: "ornament" | "image", src?}  a line between blocks; an ornament on it; or a picture (src)
   name      := {kind: "name"}                                          the Actor's or Item's name; changed on the sheet once it is unlocked
   portrait  := {kind: "portrait", fit?, height?, shape?}               its image (the Document's img), framed like an image block; changed
                                                                       with Foundry's file picker (the camera button) once the sheet is unlocked
   token     := {kind: "token", fit?, height?, shape?, updatePlaced?}   on an Actor sheet, the image of its prototype token; updatePlaced: true
                                                                       also changes the tokens of that Actor already placed in scenes.
                name, portrait and token are never inside a repeater: they are the Document's, not a row's.
   spacer    := {kind: "spacer"}
   seenBy: on any node below the root, who gets it (and what it holds): some of "player" (an owner of the Actor),
           "observer" (anyone else who opens the sheet) and "gm"; all when absent. Nobody writes through a node they do not get.
   style: any node may carry one (colors, background, border, font, size, alignment, margins): layout-style-contract.mjs.
   icon, labelShow: a tab, section, value or action may show a Font Awesome icon ("fa-solid fa-heart"; fa-solid when no
           style is named). labelShow: "both" (the default with an icon), "icon" (the icon alone, its text kept for screen
           readers and as the tooltip) or "text" (the icon kept but not shown).
   span: 1 to the parent's columns (default 1); rowSpan: 2 to 6 rows of the parent's grid; width: "small" | "medium" | "large",
           a fixed width (it never overflows its cell). visibleIf: a Condition of the Ruleset, evaluated for the Actor (for the
           row's Definition in a list): false, the block is left out. tooltip: {text} (free text) or {description: true}
           (the description of the value's Definition), shown on hover.
    Node ids are unique in the sheet; the tree is at most 8 levels and 500 nodes deep. */

import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {IMAGE_PATH, SHEET_IMAGE_FITS, SHEET_IMAGE_HEIGHTS, prepareLayoutStyle} from "./layout-style-contract.mjs";

export const LAYOUT_CONTAINERS = Object.freeze(["tabs", "tab", "section", "grid", "repeater"]);
export const LAYOUT_LEAVES = Object.freeze(["value", "action", "text", "image", "contents", "progression", "notes", "separator", "name", "portrait", "token", "spacer"]);
/** Blocks that show the Document itself (its name, its image, its token's image): never once per row of a list. */
export const LAYOUT_DOCUMENT_KINDS = Object.freeze(["name", "portrait", "token"]);
export const LAYOUT_NODE_KINDS = Object.freeze([...LAYOUT_CONTAINERS, ...LAYOUT_LEAVES]);
export const LAYOUT_SOURCE_KINDS = Object.freeze(["output", "formula", "parameter", "each", "field", "content"]);
export const LAYOUT_VALUE_DISPLAYS = Object.freeze(["field", "gauge", "dots", "boxes", "clock", "description"]);
/** Displays that count points one by one (up to the maximum, or node.dots). */
export const LAYOUT_COUNTED_DISPLAYS = Object.freeze(["dots", "boxes", "clock"]);
/** Sources a text may show between braces. */
export const LAYOUT_TEXT_SOURCES = Object.freeze(["output", "formula", "parameter", "each"]);
/** "{name}" in a text: the name of one of its values. */
export const TEXT_PLACEHOLDER = /\{([^{}\r\n]{1,40})\}/g;
export const LAYOUT_OVERLAYS = Object.freeze(["top", "center", "bottom"]);
export const LAYOUT_WIDTHS = Object.freeze({small: "8rem", medium: "14rem", large: "20rem"});
export const LAYOUT_MAX_ROW_SPAN = 6;
export const LAYOUT_NOTE_HEIGHTS = Object.freeze({small: "4rem", medium: "8rem", large: "16rem"});
export const LAYOUT_SEPARATOR_LOOKS = Object.freeze(["line", "ornament", "image"]);
/** Blocks a click on which may use an Action. */
export const LAYOUT_CLICKABLE = Object.freeze(["value", "text", "image", "repeater"]);
/** The longest text a notes block keeps. */
export const LAYOUT_NOTE_LENGTH = 20000;
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
  repeater: ["query", "columns", "children"], value: ["source", "labelKey", "write", "display", "dots"], action: ["actionRef", "labelKey"], text: ["textKey", "values"], image: ["src", "fit", "height", "shape"], contents: ["contentTypeIds"], progression: ["progressionSystemRef"],
  notes: ["labelKey", "format", "height", "write"], separator: ["look", "src"], name: [], portrait: ["fit", "height", "shape"], token: ["fit", "height", "shape", "updatePlaced"], spacer: []
};
FIELDS.section.push("collapsible", "overlay"); FIELDS.grid.push("overlay");
for (const kind of LAYOUT_CLICKABLE) FIELDS[kind].push("clickActionRef");
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function prepareSource(source, path, inRepeater, kinds = LAYOUT_SOURCE_KINDS) {
  if (!isRecord(source) || !kinds.includes(source.kind)) throw new Error(`${path}.kind must be ${kinds.join(", ")}.`);
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
    for (const key of Object.keys(node)) if (!["id", "kind", "span", "rowSpan", "width", "visibleIf", "tooltip", "style", "seenBy", ...(LAYOUT_LABELLED.includes(node.kind) ? ["icon", "labelShow"] : []), ...FIELDS[node.kind]].includes(key)) throw new Error(`${path} contains unsupported field: ${key}.`);
    if ((node.kind === "tab") !== (parent?.kind === "tabs")) throw new Error(node.kind === "tab" ? `${path}: a tab belongs in tabs.` : `${path}: tabs hold only tabs.`);
    const next = {id: node.id, kind: node.kind};
    const parentColumns = parent && MAX_COLUMNS[parent.kind] ? parent.columns : 1;
    if (node.span !== undefined) {
      if (!Number.isSafeInteger(node.span) || node.span < 1 || node.span > parentColumns) throw new Error(`${path}.span must be between 1 and ${parentColumns}.`);
      if (node.span > 1) next.span = node.span;
    }
    if (node.rowSpan !== undefined) {
      if (!parent || !Number.isSafeInteger(node.rowSpan) || node.rowSpan < 1 || node.rowSpan > LAYOUT_MAX_ROW_SPAN) throw new Error(`${path}.rowSpan must be between 1 and ${LAYOUT_MAX_ROW_SPAN}, below the root.`);
      if (node.rowSpan > 1) next.rowSpan = node.rowSpan;
    }
    if (node.width !== undefined) {
      if (!parent || !LAYOUT_WIDTHS[node.width]) throw new Error(`${path}.width must be ${Object.keys(LAYOUT_WIDTHS).join(", ")}, below the root.`);
      next.width = node.width;
    }
    if (node.visibleIf !== undefined && node.visibleIf !== null && node.visibleIf !== "") {
      if (!parent || !nonempty(node.visibleIf)) throw new Error(`${path}.visibleIf must be a Condition id, below the root.`);
      next.visibleIf = node.visibleIf;
    }
    if (node.tooltip !== undefined && node.tooltip !== null) {
      const tip = node.tooltip, keys = isRecord(tip) ? Object.keys(tip) : [];
      if (keys.length === 1 && keys[0] === "text" && nonempty(tip.text)) next.tooltip = {text: tip.text};
      else if (keys.length === 1 && tip.description === true && node.kind === "value" && ["output", "each"].includes(node.source?.kind)) next.tooltip = {description: true};
      else throw new Error(`${path}.tooltip must be {text} or, on a Definition's value, {description: true}.`);
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
    if (["tab", "section"].includes(node.kind) || node.labelKey !== undefined && ["value", "action", "notes"].includes(node.kind)) {
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
    if (node.collapsible !== undefined && node.collapsible !== false) { if (node.collapsible !== true) throw new Error(`${path}.collapsible must be true.`); next.collapsible = true; }
    if (node.overlay !== undefined) {
      if (!LAYOUT_OVERLAYS.includes(node.overlay)) throw new Error(`${path}.overlay must be ${LAYOUT_OVERLAYS.join(", ")}.`);
      next.overlay = node.overlay;
    }
    if (node.clickActionRef !== undefined && node.clickActionRef !== null && node.clickActionRef !== "") {
      if (!nonempty(node.clickActionRef)) throw new Error(`${path}.clickActionRef must be an Action id.`);
      next.clickActionRef = node.clickActionRef;
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
        if (!LAYOUT_COUNTED_DISPLAYS.includes(next.display) || !Number.isSafeInteger(node.dots) || node.dots < 1 || node.dots > LAYOUT_MAX_DOTS) throw new Error(`${path}.dots must be 1 to ${LAYOUT_MAX_DOTS}, on a value shown as dots, boxes or a clock.`);
        next.dots = node.dots;
      }
    }
    if (node.kind === "action") { if (!nonempty(node.actionRef)) throw new Error(`${path}.actionRef must be an id.`); next.actionRef = node.actionRef; }
    if (node.kind === "progression") {
      if (!nonempty(node.progressionSystemRef)) throw new Error(`${path}.progressionSystemRef must be an id.`);
      if (inRepeater) throw new Error(`${path}: a progression is the Actor's, never once per row of a list.`);
      next.progressionSystemRef = node.progressionSystemRef;
    }
    if (node.kind === "text") {
      if (typeof node.textKey !== "string") throw new Error(`${path}.textKey must be text.`);
      next.textKey = node.textKey;
      if (node.values !== undefined) {
        if (!isRecord(node.values)) throw new Error(`${path}.values must be {name: source}.`);
        const values = {};
        for (const [name, source] of Object.entries(node.values)) {
          if (!/^[^{}\r\n]{1,40}$/.test(name)) throw new Error(`${path}.values: "${name}" cannot be a value name.`);
          values[name] = prepareSource(source, `${path}.values.${name}`, inRepeater, LAYOUT_TEXT_SOURCES);
        }
        if (Object.keys(values).length) next.values = values;
      }
    }
    if (node.kind === "notes") {
      if (inRepeater) throw new Error(`${path}: notes are the Actor's, never once per row of a list.`);
      if (node.format !== undefined && node.format !== "plain") { if (node.format !== "rich") throw new Error(`${path}.format must be plain or rich.`); next.format = "rich"; }
      if (node.height !== undefined) { if (!LAYOUT_NOTE_HEIGHTS[node.height]) throw new Error(`${path}.height must be ${Object.keys(LAYOUT_NOTE_HEIGHTS).join(", ")}.`); next.height = node.height; }
      if (node.write !== undefined && node.write !== null) {
        if (!isRecord(node.write) || node.write.operation !== "set" || Object.keys(node.write).some(key => !["operation", "by"].includes(key)) || node.write.by !== undefined && node.write.by !== "gm")
          throw new Error(`${path}.write must be {operation: "set", by?: "gm"}.`);
        next.write = {operation: "set", ...(node.write.by ? {by: "gm"} : {})};
      }
    }
    if (node.kind === "separator") {
      const look = node.look ?? "line";
      if (!LAYOUT_SEPARATOR_LOOKS.includes(look)) throw new Error(`${path}.look must be ${LAYOUT_SEPARATOR_LOOKS.join(", ")}.`);
      if (look !== "line") next.look = look;
      if (look === "image") {
        if (typeof node.src !== "string" || node.src && !IMAGE_PATH.test(node.src)) throw new Error(`${path}.src must be a file path.`);
        next.src = node.src;
      } else if (node.src !== undefined) throw new Error(`${path}.src is only for a picture separator.`);
    }
    if (LAYOUT_DOCUMENT_KINDS.includes(node.kind) && inRepeater) throw new Error(`${path}: a ${node.kind} block is the Document's, never once per row of a list.`);
    if (node.kind === "token" && node.updatePlaced !== undefined) {
      if (typeof node.updatePlaced !== "boolean") throw new Error(`${path}.updatePlaced must be true or false.`);
      if (node.updatePlaced) next.updatePlaced = true;
    }
    if (["image", "portrait", "token"].includes(node.kind)) {
      // An image block without a picture yet is a draft: it shows nothing in play.
      if (node.kind === "image") {
        if (typeof node.src !== "string" || node.src && !IMAGE_PATH.test(node.src)) throw new Error(`${path}.src must be a file path.`);
        next.src = node.src;
      }
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
