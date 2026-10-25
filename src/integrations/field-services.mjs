/* Reading and writing sheet fields for other modules (integrations.listSourceCandidates, resolveSource, validateTarget,
   updateTarget). Every check is made here, when the call is served, never only by the button that led to it: a value
   is read through the sheet projection (Permissions, seenBy, visibleIf, the number of a description never sent), a
   runtime value is written through runtime.writeSheetValue (transaction, ledger, relay), the Document's image, name and
   token as its sheet would, and a picture of the Ruleset only by a GM, on a draft that is not validated.
   Foundry is reached only through the injected documents adapter (foundry-integrations.mjs). */
import {chosenSheet} from "../configurator/sheet-auto-layout.mjs";
import {LAYOUT_NOTE_LENGTH} from "../configurator/layout-contract.mjs";
import {descriptionScale} from "../configurator/rule-contracts.mjs";
import {describeField, listBindableFields, listSheets, sheetOfRef} from "./sheet-fields.mjs";

export const TARGET_CODES = Object.freeze(["MISSING", "TYPE_CHANGED", "FORBIDDEN", "GM_ONLY", "NOT_ON_SHEET", "RULESET_MISMATCH", "DEFINITION_VALIDATED", "NOT_OWNED_CONTENT", "CONFLICT", "INVALID_VALUE"]);
const SOURCE_KINDS = Object.freeze(["field", "output", "parameter", "formula", "content", "contents", "document"]);
const DOCUMENT_PATHS = Object.freeze(["img", "name", "token"]);
const OUTPUTS = Object.freeze([["value", "value.final"], ["pool", "pool.current"], ["state", "state.active"]]);
const enabled = entry => entry?.enabled !== false;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const refuse = (code, reason) => ({allowed: false, code, reason});

/** A node of a projected sheet by id (list rows included). */
function viewNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of [...(node.children ?? []), ...(node.rows ?? []).flatMap(row => row.children ?? [])]) { const found = viewNode(child, id); if (found) return found; }
  return null;
}
/** A one-block sheet that shows a source the way a sheet block would. */
const probeSheet = (target, node) => ({id: "integration-source", target, root: {id: "root", kind: "grid", columns: 1, children: [{id: "source", ...node}]}});
const valueKindOf = valueType => ["number", "integer"].includes(valueType) ? "number" : valueType === "boolean" ? "boolean" : "text";

/**
 * configurator(), runtime(): the APIs once ready; documents: {get(uuid) -> handle | null, update(handle, data),
 * setTokenImage(handle, path, {placed}), sanitizeRichText(html)}; user(): {id, isGM}; translate(versionId, key).
 * A handle: {uuid, id, documentName, name, img, token, canView, canUpdate, sheetId, items, ownerUuid, flag}.
 */
export function createFieldServices({configurator, runtime, documents, user = () => ({id: null, isGM: false}), translate = (versionId, key) => key}) {
  const summaries = () => configurator().listRulesetVersionSummaries();
  /** The version another module means: the one named, else the active one of that Ruleset, else its last. */
  function versionOf(rulesetId, versionId = null) {
    const all = summaries().filter(summary => summary.rulesetId === rulesetId);
    if (versionId) return all.find(summary => summary.versionId === versionId) ?? null;
    const active = configurator().getActiveVersionId();
    return all.find(summary => summary.versionId === active) ?? all.at(-1) ?? null;
  }
  function rulesetOf(rulesetId, {versionId = null, source = "published"} = {}) {
    const summary = versionOf(rulesetId, versionId);
    if (!summary) return {summary: null, ruleset: null};
    return {summary, ruleset: configurator().getRuntimeRuleset(summary.versionId, source === "draft" ? "draft" : "published") ?? null};
  }

  /** The Document a call is about, with its Ruleset version, the sheet it shows and what the runtime knows it by. */
  async function subjectOf(context = {}) {
    const doc = context.documentUuid ? await documents.get(context.documentUuid) : null;
    if (!doc) return {error: {status: "missing", code: "MISSING", reason: "No such Document."}};
    if (!doc.canView) return {error: {status: "forbidden", code: "FORBIDDEN", reason: "You cannot see this Document."}};
    const api = configurator(), rt = runtime();
    let versionId, actor = null, content = null, target, contentTypeId = null, templateId = null;
    if (doc.documentName === "Actor") {
      versionId = (await rt.getContainerState(doc.uuid)).rulesetVersionId || api.getActiveVersionId();
      actor = doc.uuid; target = "actor";
    } else if (doc.documentName === "Item" && doc.flag?.versionId) {
      versionId = doc.flag.versionId; target = "item"; contentTypeId = doc.flag.contentTypeId ?? null; templateId = doc.flag.templateId ?? null;
      const owned = doc.ownerUuid ? (await rt.listOwnedContents(versionId, doc.ownerUuid)).some(row => row.key === doc.id) : false;
      actor = owned ? doc.ownerUuid : null; content = owned ? {key: doc.id} : {templateId};
    } else return {error: {status: "unavailable", code: "MISSING", reason: "This Document is not under a Ruleset."}};
    const summary = summaries().find(entry => entry.versionId === versionId);
    const ruleset = summary ? api.getRuntimeRuleset(versionId, "published") : null;
    if (!ruleset) return {error: {status: "unavailable", code: "MISSING", reason: "The Ruleset of this Document is not published."}};
    const sheet = chosenSheet(ruleset, doc.sheetId ?? null, {target, contentTypeId});
    return {doc, versionId, rulesetId: summary.rulesetId, status: summary.status, ruleset, actor, content, target, contentTypeId, templateId, sheet};
  }
  const project = (subject, sheet = subject.sheet) => runtime().projectSheet(subject.versionId, sheet, {actor: subject.actor, content: subject.content, items: subject.doc.items ?? []});

  /** What a field holds for this Document now, or undefined when this user does not get it on the sheet. */
  async function fieldValue(subject, field, {draft = null} = {}) {
    const ref = field.ref;
    if (field.storage === "contentTemplateImage") return ((draft ?? subject.ruleset).contentTemplates ?? []).find(entry => entry.id === subject.templateId)?.image ?? "";
    if (field.storage === "sheetNodeSrc" && draft) return viewNode(sheetOfRef(draft, ref)?.root, ref.nodeId)?.src ?? "";
    const view = await project(subject);
    if (ref.slot) return view.header === "none" ? undefined : ref.slot === "header.img" ? subject.doc.img ?? "" : subject.doc.name ?? "";
    const node = viewNode(view.root, ref.nodeId);
    if (!node) return undefined;
    if (field.storage === "documentImg") return subject.doc.img ?? "";
    if (field.storage === "documentName") return subject.doc.name ?? "";
    if (field.storage === "tokenImg") return subject.doc.token ?? "";
    if (field.storage === "sheetNodeSrc") return node.src ?? "";
    return node.value ?? "";
  }

  async function validateTarget(context, ref = {}) {
    const subject = await subjectOf(context);
    if (subject.error) return refuse(subject.error.code, subject.error.reason);
    if (ref.rulesetId && ref.rulesetId !== subject.rulesetId) return refuse("RULESET_MISMATCH", `This Document is under ${subject.rulesetId}.`);
    const elsewhere = ref.sheetId !== subject.sheet.id || (ref.target ?? "actor") !== subject.target;
    if (elsewhere && sheetOfRef(subject.ruleset, ref)) return refuse("NOT_ON_SHEET", "This Document shows another sheet.");
    const field = describeField(subject.ruleset, ref);
    if (field.status === "missing") return refuse("MISSING", `The ${field.reason} is gone.`);
    if (field.status === "typeChanged") return refuse("TYPE_CHANGED", `The block is now ${field.current}.`);
    if (elsewhere) return refuse("NOT_ON_SHEET", "This Document shows another sheet.");
    if (field.inRepeater) return refuse("FORBIDDEN", "A block inside a list is not a target.");
    if (!field.writable) return refuse("FORBIDDEN", "This block cannot be changed.");
    const who = user();
    if (field.scope === "definition") {
      if (!who.isGM) return refuse("GM_ONLY", "Only a GM changes the Ruleset.");
      if (subject.status === "validated") return refuse("DEFINITION_VALIDATED", "This version is validated: create a new version to change it.");
      const draft = configurator().getRuntimeRuleset(subject.versionId, "draft");
      if (field.storage === "contentTemplateImage" && !(draft?.contentTemplates ?? []).some(entry => entry.id === subject.templateId)) return refuse("MISSING", "The Content Template is gone from the draft.");
      if (field.storage === "sheetNodeSrc" && describeField(draft, ref).status !== "ok") return refuse("MISSING", "The block is gone from the draft.");
      return {allowed: true, descriptor: field, current: await fieldValue(subject, field, {draft}), versionId: subject.versionId, draftOnly: true};
    }
    if (["documentImg", "documentName", "tokenImg"].includes(field.storage) && !subject.doc.canUpdate) return refuse("FORBIDDEN", "You cannot change this Document.");
    if (field.storage === "contentField" && !subject.content?.key) return refuse("NOT_OWNED_CONTENT", "Only an Item an Actor holds keeps its own fields.");
    const current = await fieldValue(subject, field);
    if (current === undefined) return refuse("FORBIDDEN", "This block is not on your sheet.");
    if (["runtimeNote", "contentField"].includes(field.storage)) {
      const node = viewNode((await project(subject)).root, ref.nodeId);
      if (!node?.write) return refuse(field.writeBy === "gm" && !who.isGM ? "GM_ONLY" : "FORBIDDEN", "You cannot change this block.");
    }
    return {allowed: true, descriptor: field, current, versionId: subject.versionId};
  }

  /** value checked against what the field holds; the text a write keeps, or an error. */
  function checked(field, value) {
    if (field.valueKind === "image") {
      if (typeof value !== "string" || !value.trim() || /^\s*(javascript|vbscript):/i.test(value) || /[<>"]/.test(value)) return {error: "An image is a file path or an address."};
      return {value: value.trim()};
    }
    if (typeof value !== "string") return {error: "This field takes text."};
    if (field.storage === "documentName" && !value.trim()) return {error: "A name cannot be empty."};
    if (field.storage === "runtimeNote" && value.length > LAYOUT_NOTE_LENGTH) return {error: `A note holds at most ${LAYOUT_NOTE_LENGTH} characters.`};
    return {value: field.valueKind === "richText" ? documents.sanitizeRichText(value) : value};
  }

  async function updateTarget(context, ref, value, {expectedCurrent} = {}) {
    const verdict = await validateTarget(context, ref);
    if (!verdict.allowed) return {ok: false, code: verdict.code, reason: verdict.reason};
    if (expectedCurrent !== undefined && !same(expectedCurrent, verdict.current)) return {ok: false, code: "CONFLICT", reason: "The field changed since it was read.", current: verdict.current};
    const field = verdict.descriptor, input = checked(field, value);
    if (input.error) return {ok: false, code: "INVALID_VALUE", reason: input.error};
    const subject = await subjectOf(context), api = configurator(), rt = runtime();
    try {
      switch (field.storage) {
        case "runtimeNote": await rt.writeSheetValue(subject.versionId, subject.actor, {sheetId: subject.sheet.id, nodeId: ref.nodeId, value: input.value}); break;
        case "contentField": await rt.writeSheetValue(subject.versionId, subject.actor, {sheetId: subject.sheet.id, nodeId: ref.nodeId, value: input.value, contentKey: subject.content.key, contentTypeId: subject.contentTypeId}); break;
        case "documentImg": await documents.update(subject.doc, {img: input.value}); break;
        case "documentName": await documents.update(subject.doc, {name: input.value}); break;
        case "tokenImg": await documents.setTokenImage(subject.doc, input.value, {placed: Boolean(field.updatePlaced)}); break;
        case "sheetNodeSrc": {
          const sheet = structuredClone(api.getRuntimeRuleset(subject.versionId, "draft").sheetDefinitions.find(entry => entry.id === ref.sheetId));
          viewNode(sheet.root, ref.nodeId).src = input.value;
          await api.updateSheetDefinition(subject.versionId, ref.sheetId, {root: sheet.root});
          break;
        }
        case "contentTemplateImage": await api.updateContentTemplate(subject.versionId, subject.templateId, {image: input.value}); break;
        default: return {ok: false, code: "FORBIDDEN", reason: "This field cannot be written."};
      }
    } catch (error) {
      return {ok: false, code: error?.code === "FORBIDDEN" || /forbidden|cannot|not on your sheet|only a gm/i.test(error?.message ?? "") ? "FORBIDDEN" : "INVALID_VALUE", reason: error?.message ?? String(error)};
    }
    return {ok: true, previous: verdict.current, current: input.value, ...(verdict.draftOnly ? {draftOnly: true} : {})};
  }

  async function resolveSource(context, source = {}) {
    if (!SOURCE_KINDS.includes(source.kind)) return {status: "missing", reason: `Unknown source kind ${source.kind}.`};
    const subject = await subjectOf(context);
    if (subject.error) return {status: subject.error.status, reason: subject.error.reason};
    const rulesetId = source.kind === "field" ? source.ref?.rulesetId : source.rulesetId;
    if (rulesetId && rulesetId !== subject.rulesetId) return {status: "rulesetMismatch", reason: `This Document is under ${subject.rulesetId}.`};
    const t = key => translate(subject.versionId, key), ruleset = subject.ruleset;
    const ok = (valueKind, value, label) => ({status: "ok", valueKind, value, label: label ? t(label) : ""});
    if (source.kind === "document") {
      if (!DOCUMENT_PATHS.includes(source.path)) return {status: "missing", reason: `Unknown Document path ${source.path}.`};
      if (source.path === "token" && subject.target !== "actor") return {status: "missing", reason: "Only an Actor has a token."};
      return ok(source.path === "name" ? "text" : "image", source.path === "name" ? subject.doc.name : source.path === "img" ? subject.doc.img : subject.doc.token, "");
    }
    if (source.kind === "field") {
      const ref = source.ref ?? {}, field = describeField(ruleset, ref);
      if (field.status !== "ok") return {status: "missing", reason: field.status === "missing" ? `The ${field.reason} is gone.` : `The block is now ${field.current}.`};
      if (ref.sheetId !== subject.sheet.id || (ref.target ?? "actor") !== subject.target) return {status: "unavailable", reason: "This Document shows another sheet."};
      const value = await fieldValue(subject, field);
      return value === undefined ? {status: "forbidden", reason: "This block is not on your sheet."} : ok(field.valueKind, value, field.label ?? "");
    }
    // A value, a Parameter, a Formula or the Contents held: shown by a one-block sheet, so it is read as a sheet reads it.
    let node, exists;
    if (source.kind === "output") {
      const reference = source.reference ?? {};
      exists = (ruleset.definitions ?? []).some(entry => entry.id === reference.objectId);
      node = {kind: "value", source: {kind: "output", reference}, ...(source.narrative ? {display: "description"} : {})};
    } else if (source.kind === "parameter") { exists = (ruleset.parameters ?? []).some(entry => entry.id === source.parameterRef); node = {kind: "value", source: {kind: "parameter", parameterRef: source.parameterRef}}; }
    else if (source.kind === "formula") { exists = (ruleset.formulas ?? []).some(entry => entry.id === source.formulaRef); node = {kind: "value", source: {kind: "formula", formulaRef: source.formulaRef}}; }
    else if (source.kind === "content") { exists = (ruleset.contentTypes ?? []).some(entry => entry.id === source.contentTypeId); node = {kind: "value", source: {kind: "content", contentTypeId: source.contentTypeId}}; }
    else { exists = true; node = {kind: "contents", ...(source.contentTypeIds?.length ? {contentTypeIds: [...source.contentTypeIds]} : {})}; }
    if (!exists) return {status: "missing", reason: "It is gone from the Ruleset."};
    if (subject.target !== "actor" && ["content", "contents"].includes(source.kind)) return {status: "unavailable", reason: "Only an Actor holds Contents."};
    let view;
    try { view = viewNode((await project(subject, probeSheet(subject.target, node))).root, "source"); } catch (error) { return {status: "unavailable", reason: error?.message ?? String(error)}; }
    if (!view || view.kind === "spacer") return {status: "forbidden", reason: "You may not read it."};
    if (source.kind === "contents") return ok("list", (view.rows ?? []).map(row => ({name: t(row.label), img: row.img ?? "", type: row.type ? t(row.type) : ""})), "");
    if (view.error !== undefined) return {status: "unavailable", reason: String(view.error)};
    if (source.narrative && (view.value === null || view.value === undefined)) return {status: "unavailable", reason: "No words describe this value."};
    return ok(source.narrative || source.kind === "content" ? "text" : valueKindOf(view.valueType), source.narrative && typeof view.value === "string" ? t(view.value) : view.value, view.label ?? "");
  }

  return {
    async listSheetDefinitions(rulesetId, {versionId = null, source = "published"} = {}) {
      const {ruleset} = rulesetOf(rulesetId, {versionId, source});
      return ruleset ? listSheets(ruleset) : [];
    },
    async listBindableFields(rulesetId, sheetId, {versionId = null, source = "published", target = "actor", contentTypeId = null} = {}) {
      const {ruleset} = rulesetOf(rulesetId, {versionId, source});
      return ruleset ? listBindableFields(ruleset, {rulesetId, sheetId, target, contentTypeId}) : [];
    },
    async describeField(ref = {}, {versionId = null, source = "published", nodeKind} = {}) {
      const {summary, ruleset} = rulesetOf(ref.rulesetId, {versionId, source});
      if (!ruleset) return {status: "missing", reason: "ruleset"};
      const field = describeField(ruleset, ref, {nodeKind});
      if (field.status === "ok" && source === "draft") {
        const published = configurator().getRuntimeRuleset(summary.versionId, "published");
        if (!published || describeField(published, ref, {nodeKind}).status !== "ok") field.publishedMissing = true;
      }
      return field;
    },
    /** What an editor may offer to read: the readable fields of the sheet, values (with their words when a scale
     * describes them), Parameters, Formulas, Content Types, the Contents held and the Document's own image and name. */
    async listSourceCandidates(rulesetId, {sheetId = null, target = "actor", contentTypeId = null, versionId = null, source = "published"} = {}) {
      const {summary, ruleset} = rulesetOf(rulesetId, {versionId, source});
      if (!ruleset) return [];
      const t = key => translate(summary.versionId, key), out = [];
      if (sheetId) for (const field of listBindableFields(ruleset, {rulesetId, sheetId, target, contentTypeId}).filter(field => !field.inRepeater))
        out.push({source: {kind: "field", ref: field.ref}, label: field.label ? t(field.label) : field.nodeKind, valueKind: field.valueKind});
      for (const definition of (ruleset.definitions ?? []).filter(enabled)) for (const [capabilityId, outputId] of OUTPUTS) {
        if (!(definition.capabilities ?? []).includes(capabilityId)) continue;
        const slotId = capabilityId === "pool" ? definition.slots?.pool?.[0]?.id : null;
        out.push({source: {kind: "output", reference: {objectKind: "definition", objectId: definition.id, capabilityId, ...(slotId ? {slotId} : {}), outputId}}, label: t(definition.nameKey ?? definition.id),
          valueKind: capabilityId === "state" ? "boolean" : "number", hasNarrative: capabilityId !== "state" && Boolean(descriptionScale(ruleset, definition.id))});
      }
      for (const parameter of (ruleset.parameters ?? []).filter(enabled)) out.push({source: {kind: "parameter", parameterRef: parameter.id}, label: t(parameter.nameKey ?? parameter.id), valueKind: valueKindOf(parameter.valueType)});
      for (const formula of (ruleset.formulas ?? []).filter(enabled)) out.push({source: {kind: "formula", formulaRef: formula.id}, label: t(formula.nameKey ?? formula.id), valueKind: valueKindOf(formula.resultType)});
      if (target === "actor") {
        for (const type of (ruleset.contentTypes ?? []).filter(enabled)) out.push({source: {kind: "content", contentTypeId: type.id}, label: t(type.nameKey ?? type.id), valueKind: "text"});
        out.push({source: {kind: "contents"}, label: t("RTA.Sheet.Contents"), valueKind: "list"});
      }
      for (const path of DOCUMENT_PATHS.filter(path => path !== "token" || target === "actor")) out.push({source: {kind: "document", path}, label: path, valueKind: path === "name" ? "text" : "image"});
      return out;
    },
    resolveSource, validateTarget, updateTarget
  };
}
