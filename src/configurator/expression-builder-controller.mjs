/** The Formula and Condition builder in a form, shared by the entry editor and the assistant: a slot follows its kind,
 * a block its operation, and operands and table rows are added or removed through the block's form state
 * (entry-expression-model). DOM only, no Foundry: the owner gives the operand choices, the editor kind of a builder,
 * how to wire new buttons, and what to do once the expression changed. */
import {blockView,slotView,reshapeBlock,editorOperations,blockShape,contextPathSuggestions} from "./entry-expression-model.mjs";
import {readSlotForm,readBlockForm} from "./entry-expression-serialization.mjs";
import {renderExpressionBlockHTML,renderExpressionSlotHTML} from "../ui/expression-builder-markup.mjs";
import {buildRuleReferenceChoices} from "./entry-reference-catalog.mjs";
import {selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {availableDocumentTypes,documentTypeLabel,BASE_DOCUMENT_TYPE} from "../core/system-document-types.mjs";

const BLOCK_ACTIONS = ["addRuleOperand", "removeRuleOperand", "addExprRow", "removeExprRow"];

/** Choices of every operand of a Ruleset: Parameters, Formulas, References, dice counters, roles linked by Actions,
 * context paths. optionColors(kind, entry) colours the options; findCapability reads a capability type. */
export function expressionSources(ruleset, {optionColors, findCapability, language, contextListId}) {
  const withColors = (kind, entry) => ({colors: selectColorsAttribute(optionColors(kind, entry))});
  const counters = new Map();
  for (const die of ruleset.dice ?? []) for (const counter of die.counters ?? []) if (!counters.has(counter.id)) counters.set(counter.id, {id: counter.id, label: counter.labelKey || counter.id});
  // Fields of every Content Type, once each by id: a Formula may serve Contents of several types.
  const fields = new Map();
  for (const type of ruleset.contentTypes ?? []) for (const [id, field] of Object.entries(type.fields ?? {})) if (!fields.has(id)) fields.set(id, {id, label: `${field?.name || id} (${type.nameKey || type.id})`});
  // Kinds of Actor a Condition may ask about: the Foundry Actor types of the system, the Ruleset's Actor Content Types.
  const actorTypes = availableDocumentTypes("Actor").filter(id => id !== BASE_DOCUMENT_TYPE).map(id => ({id, label: documentTypeLabel("Actor", id)}));
  const actorContentTypes = (ruleset.contentTypes ?? []).filter(type => type.storageKind === "actor").map(type => ({id: type.id, label: type.nameKey || type.id}));
  return {parameters: ruleset.parameters ?? [], formulas: ruleset.formulas ?? [], withColors, contentFields: [...fields.values()], actorTypes, actorContentTypes,
    references: buildRuleReferenceChoices({definitions: ruleset.definitions ?? [], parameters: ruleset.parameters ?? [], formulas: ruleset.formulas ?? [], findCapability, optionColors, language}),
    counters: [...counters.values()], neutral: selectColorsAttribute([RTA_NEUTRAL_COLOR]),
    roles: [...new Set((ruleset.actions ?? []).flatMap(action => (action.roleLinks ?? []).map(link => link.role)))],
    contextListId, contextPaths: contextPathSuggestions(ruleset)};
}

export class ExpressionBuilderController {
  #sources; #editorOf; #bind; #changed;
  /** sources(): the operand choices; editorOf(node): "formula" or "condition" for the builder holding node;
   * bind(fresh): wire the buttons of new markup; changed(): the expression changed. */
  constructor({sources, editorOf, bind, changed}) { this.#sources = sources; this.#editorOf = editorOf; this.#bind = bind; this.#changed = changed; }

  /** A change in the form: a slot's kind, a block's operation, a dice reading. */
  change(target) {
    this.#syncDiceRead(target);
    if (target?.matches?.("[data-rule-operand-kind]")) {
      const row = target.closest("[data-rule-operand]"), block = row?.querySelector(":scope > [data-expr-block]"), before = row?.dataset.kind || "literal";
      if (target.value === "expression" && !block) {
        // Choosing Calculation draws its block, with the former operand as its first one.
        const sources = this.#sources(), editor = this.#editorOf(row);
        const form = {kind: "expression", ...reshapeBlock(editorOperations(editor, false)[0], before === "expression" || before === "none" ? [] : [readSlotForm(row, before)])};
        this.#replace(row, renderExpressionSlotHTML(slotView(form, {label: {key: "", fallback: row.querySelector(":scope > .rta-rule-operand__label")?.textContent ?? ""}, path: row.dataset.exprPath,
          optional: Boolean(row.querySelector('[data-rule-operand-kind] option[value="none"]')), removable: Boolean(row.querySelector(':scope > .rta-rule-operand__controls > [data-action="removeRuleOperand"]')), editor}, sources), {contextListId: sources.contextListId}));
        return;
      }
      for (const editor of row?.querySelectorAll(":scope > .rta-rule-operand__controls > [data-rule-operand-editor]") ?? []) editor.hidden = editor.dataset.ruleOperandEditor !== target.value;
      if (block) block.hidden = target.value !== "expression";
      row.dataset.kind = target.value;
    }
    // A new operation of a block keeps the operands it can.
    if (target?.matches?.("[data-expr-operation]")) { const block = this.#operationBlock(target); if (block) this.#renderBlock(block, form => reshapeBlock(target.value, form.children, form.rows)); }
  }

  /** A button of a builder; true when it was one. */
  action(button, action) {
    if (!BLOCK_ACTIONS.includes(action)) return false;
    const block = button.closest("[data-expr-block]"), slot = button.closest("[data-rule-operand]"), row = button.closest("[data-expr-row]");
    if (!block?.isConnected) return true;
    const at = list => list.indexOf(action === "removeRuleOperand" ? slot : row);
    this.#renderBlock(block, form => {
      if (action === "addRuleOperand") return {...form, children: [...form.children, {kind: "literal", value: "0"}]};
      if (action === "addExprRow") return {...form, rows: [...form.rows, blockShape(form.operation) === "range" ? {min: "", max: "", value: "0"} : {key: "", value: "0"}]};
      if (action === "removeRuleOperand") { const i = at([...block.querySelectorAll(":scope > [data-rule-operand]")]); return form.children.length > 1 ? {...form, children: form.children.filter((_, j) => j !== i)} : form; }
      const i = at([...block.querySelectorAll(":scope > [data-expr-rows] > [data-expr-row]")]); return form.rows.length > 1 ? {...form, rows: form.rows.filter((_, j) => j !== i)} : form;
    });
    return true;
  }

  /** The block an operation select drives: the root block, or the nested block of its slot. */
  #operationBlock(select) {
    const root = select.closest("[data-expr-root]"), row = select.closest("[data-rule-operand]");
    return row && root?.contains(row) ? row.querySelector(":scope > [data-expr-block]") : root?.querySelector(":scope > [data-expr-block]");
  }
  /** Redraw a block from its current form state, changed by edit (an operand added, an operation changed). */
  #renderBlock(block, edit) {
    const root = block.parentElement?.matches("[data-expr-root]"), row = root ? null : block.closest("[data-rule-operand]");
    const select = root ? block.parentElement.querySelector(":scope > .rta-form-row [data-expr-operation]") : row.querySelector(":scope > .rta-rule-operand__controls [data-expr-operation]");
    const form = edit({operation: String(select?.value ?? ""), ...readBlockForm(block)}), sources = this.#sources();
    this.#replace(block, renderExpressionBlockHTML(blockView(form, {path: row?.dataset.exprPath ?? "", editor: this.#editorOf(block), root}, sources), {contextListId: sources.contextListId, root}));
  }
  /** Swap a slot or block for new markup and wire its buttons. */
  #replace(node, html) {
    const template = node.ownerDocument.createElement("template"); template.innerHTML = html; const fresh = template.content.firstElementChild;
    node.replaceWith(fresh); this.#bind(fresh); this.#changed();
  }
  /** Dice read by counter take a counter; any other reading may compare the faces. */
  #syncDiceRead(target) {
    if (!target?.matches?.('[data-rule-operand-editor="dice"] [data-operand-part="read"]')) return;
    const editor = target.closest("[data-rule-operand-editor]"), counter = target.value === "counter";
    for (const part of editor.querySelectorAll("[data-dice-compare-only]")) part.hidden = counter;
    for (const part of editor.querySelectorAll("[data-dice-counter-only]")) part.hidden = !counter;
  }
}
