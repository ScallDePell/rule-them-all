/* Block templates ("Modèles de blocs") and sheet files: pure operations of the sheet editor.
   A template is a block saved in the Ruleset (sheetTemplates, rule-contracts.mjs prepareSheetTemplate) and offered in the
   palette of every sheet it fits; inserting it is pasting an independent copy (sheet-layout-clipboard.mjs: new ids, the
   same checks of what the Ruleset and the sheet have). A held-Contents block may show each Content as a card made from a
   template whose values are the Content's fields (cardTemplates).
   A sheet or a template is exported as a JSON file and imported into another Ruleset: what the file names that this
   Ruleset lacks is reported, and the blocks that name it can be left out (pruneMissing). */
import {CARD_EXCLUDED_KINDS, layoutTarget, prepareTemplateBlock} from "./layout-contract.mjs";
import {prepareSheetDefinition, prepareSheetTemplate} from "./rule-contracts.mjs";
import {missingReferences, nodeMissing, pasteBlock, withFreshIds} from "./sheet-layout-clipboard.mjs";
import {canPlace, insertNode, removeNode, updateNode} from "./sheet-layout-model.mjs";
import {freeId, readableId} from "./identity.mjs";
import {prepareSheetThemeLook, themeBody} from "./sheet-themes.mjs";

const enabled = entry => entry?.enabled !== false;
function* nodes(root) { if (!root) return; yield root; for (const child of root.children ?? []) yield* nodes(child); }

/** The templates a sheet of this target can take, in Ruleset order. */
export const templatesFor = (ruleset, target = "actor") => (ruleset.sheetTemplates ?? []).filter(template => enabled(template) && [target, "any"].includes(layoutTarget(template.root)));

/** The templates a held-Contents block can draw its cards with: blocks of Content fields (or of nothing an Actor alone has). */
export const cardTemplates = ruleset => templatesFor(ruleset, "item").filter(template => ![...nodes(template.root)].some(node => CARD_EXCLUDED_KINDS.includes(node.kind)));

/** A new template from a block of a sheet: {data} for createSheetTemplate (its width is the place's, not kept), or
    {error: "each"} when the block shows the row of a list it is not part of (save the whole list instead). */
export function templateFromBlock(node, name, ruleset) {
  const block = structuredClone(node);
  delete block.span;
  try { prepareTemplateBlock(block); } catch { return {error: "each"}; }
  const taken = new Set((ruleset.sheetTemplates ?? []).map(entry => entry.id));
  return {data: {id: freeId(`template-${readableId(name) || "block"}`, taken), nameKey: name, root: block}};
}
/** The template of this name (to replace rather than add one more), or undefined. */
export const templateNamed = (ruleset, name) => (ruleset.sheetTemplates ?? []).find(entry => entry.nameKey.trim().toLowerCase() === String(name).trim().toLowerCase());

/** A template inserted at targetId (into it, or next to it: before/beside as a drop says), or into the selection like a
    paste when no place is given: {root, id} or {error: "place"} | {error: "missing", missing}. */
export function insertTemplate(root, template, targetId, ruleset, {target = "actor", contentTypeIds = [], before = false, beside = null} = {}) {
  if (beside === null) return pasteBlock(root, template.root, targetId, ruleset, {target, contentTypeIds});
  const block = withFreshIds(template.root, root);
  if (!canPlace(root, block, targetId, {beside})) return {error: "place"};
  const next = updateNode(insertNode(root, targetId, block, {before, beside}), block.id, {});
  const missing = missingReferences(next, block.id, ruleset, {target, contentTypeIds});
  return missing.length ? {error: "missing", missing} : {root: next, id: block.id};
}

/** The tree without the blocks that name what the Ruleset or the sheet lacks (and all they hold). */
export function pruneMissing(root, ruleset, options = {}) {
  let next = root;
  for (;;) {
    const bad = [...nodes(next)].find(node => node.id !== next.id && nodeMissing(next, node, ruleset, options).length);
    if (!bad) return next;
    next = removeNode(next, bad.id);
  }
}

/* Files. */
export const SHEET_FILE_FORMAT = "rule-them-all.sheet";
export const TEMPLATE_FILE_FORMAT = "rule-them-all.sheet-template";
const FILE_VERSION = 1;
/** The templates a tree draws its cards with. */
const cardRefs = root => [...new Set([...nodes(root)].map(node => node.cards?.templateRef).filter(Boolean))];

/** A sheet as a file: its settings and layout, with the templates its cards are drawn with and the Ruleset theme it takes. */
export function sheetFile(sheet, ruleset) {
  const {id: _id, enabled: _enabled, order: _order, tags: _tags, ...kept} = structuredClone(sheet);
  const templates = cardRefs(sheet.root).map(id => (ruleset.sheetTemplates ?? []).find(entry => entry.id === id)).filter(Boolean).map(templateBody);
  const themes = (ruleset.sheetThemes ?? []).filter(entry => entry.id === sheet.theme?.themeRef).map(themeBody);
  return {format: SHEET_FILE_FORMAT, version: FILE_VERSION, sheet: kept, templates, ...(themes.length ? {themes} : {})};
}
const templateBody = template => ({id: template.id, nameKey: template.nameKey, ...(template.descriptionKey ? {descriptionKey: template.descriptionKey} : {}), root: structuredClone(template.root)});
/** A template as a file. */
export const templateFile = template => ({format: TEMPLATE_FILE_FORMAT, version: FILE_VERSION, template: templateBody(template)});

/** The contents of a sheet or template file, checked: {kind: "sheet", sheet, templates} | {kind: "template", template}.
    Throws {code: "format"} on a file that is neither, or the contract's error on a broken one. */
export function readSheetFile(text) {
  let data;
  try { data = typeof text === "string" ? JSON.parse(text) : text; } catch { throw Object.assign(new Error("Not a JSON file."), {code: "format"}); }
  if (data?.format === TEMPLATE_FILE_FORMAT && data.version === FILE_VERSION) {
    const template = prepareSheetTemplate({...data.template, id: data.template?.id || "template"});
    return {kind: "template", template: {id: template.id, nameKey: template.nameKey, descriptionKey: template.descriptionKey, root: template.root}};
  }
  if (data?.format === SHEET_FILE_FORMAT && data.version === FILE_VERSION) {
    const {id: _id, ...sheet} = prepareSheetDefinition({...data.sheet, id: "imported"});
    const templates = (Array.isArray(data.templates) ? data.templates : []).map(entry => {
      const template = prepareSheetTemplate({...entry, id: entry?.id || "template"});
      return {id: template.id, nameKey: template.nameKey, descriptionKey: template.descriptionKey, root: template.root};
    });
    const themes = (Array.isArray(data.themes) ? data.themes : []).map(entry => {
      if (typeof entry?.id !== "string" || !entry.id || typeof entry.nameKey !== "string" || !entry.nameKey.trim()) throw new Error("A theme of the sheet file has no id or name.");
      const {base, overrides} = prepareSheetThemeLook({base: entry.base, overrides: entry.overrides});
      return {id: entry.id, nameKey: entry.nameKey, ...(entry.descriptionKey ? {descriptionKey: entry.descriptionKey} : {}), base, ...(overrides ? {overrides} : {})};
    });
    return {kind: "sheet", sheet, templates, themes};
  }
  throw Object.assign(new Error("Not a sheet or block template file."), {code: "format"});
}

/** Bring a template from a file into this Ruleset's terms: {template, missing} where missing lists what its blocks name
    and the Ruleset lacks (on the sheets it fits); its id is made free in the Ruleset. */
export function importedTemplate(template, ruleset) {
  const target = layoutTarget(template.root) === "item" ? "item" : "actor";
  const holder = {id: "template-holder", kind: "grid", columns: 6, children: [template.root]};
  const missing = missingReferences(holder, template.root.id, ruleset, {target});
  const taken = new Set((ruleset.sheetTemplates ?? []).map(entry => entry.id));
  return {template: {...template, id: freeId(template.id, taken)}, missing};
}
/** The template without the blocks that name what this Ruleset lacks (null when its own block does). */
export function prunedTemplate(template, ruleset) {
  const target = layoutTarget(template.root) === "item" ? "item" : "actor";
  const holder = {id: "template-holder", kind: "grid", columns: 6, children: [template.root]};
  if (nodeMissing(holder, template.root, ruleset, {target}).length) return null;
  return {...template, root: pruneMissing(holder, ruleset, {target}).children[0]};
}

/** A sheet from a file, in this Ruleset's terms: {sheet, templates, themes, missing}. The templates its cards need and
    the theme it takes are the Ruleset's own when it has one of that id, else they come with the file (templates,
    themes: those to create); missing lists what its blocks or its Content Types name and the Ruleset lacks. */
export function importedSheet(file, ruleset) {
  const have = new Set((ruleset.sheetTemplates ?? []).map(entry => entry.id));
  const templates = file.templates.filter(template => !have.has(template.id) && cardRefs(file.sheet.root).includes(template.id));
  const withTemplates = {...ruleset, sheetTemplates: [...(ruleset.sheetTemplates ?? []), ...templates]};
  const options = {target: file.sheet.target, contentTypeIds: file.sheet.contentTypeIds ?? []};
  const missing = new Set(missingReferences(file.sheet.root, file.sheet.root.id, withTemplates, options));
  for (const id of file.sheet.contentTypeIds ?? []) if (!(ruleset.contentTypes ?? []).some(type => type.id === id)) missing.add(id);
  for (const template of templates) for (const id of importedTemplate(template, ruleset).missing) missing.add(id);
  const themes = (file.themes ?? []).filter(theme => theme.id === file.sheet.theme?.themeRef && !(ruleset.sheetThemes ?? []).some(entry => entry.id === theme.id));
  if (file.sheet.theme?.themeRef && !themes.length && !(ruleset.sheetThemes ?? []).some(entry => entry.id === file.sheet.theme.themeRef)) missing.add(file.sheet.theme.themeRef);
  return {sheet: file.sheet, templates, themes, missing: [...missing]};
}
/** The sheet from a file without what this Ruleset lacks: blocks left out, Content Types dropped, templates pruned. */
export function prunedSheet({sheet, templates, themes = []}, ruleset) {
  const kept = templates.map(template => prunedTemplate(template, ruleset)).filter(Boolean);
  const withTemplates = {...ruleset, sheetTemplates: [...(ruleset.sheetTemplates ?? []), ...kept]};
  const contentTypeIds = (sheet.contentTypeIds ?? []).filter(id => (ruleset.contentTypes ?? []).some(type => type.id === id));
  const root = pruneMissing(sheet.root, withTemplates, {target: sheet.target, contentTypeIds});
  const themeKnown = !sheet.theme?.themeRef || themes.length || (ruleset.sheetThemes ?? []).some(entry => entry.id === sheet.theme.themeRef);
  const {theme: _theme, ...rest} = sheet;
  return {sheet: {...rest, contentTypeIds, root, ...(sheet.theme && themeKnown ? {theme: sheet.theme} : {})}, templates: kept.filter(template => cardRefs(root).includes(template.id)), themes};
}
