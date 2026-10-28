import {escapeHTML as escape} from "./html-utils.mjs";
import {localizedKeyMarkup as k} from "./ui-localization.mjs";
/** Pure HTML of the Formula and Condition builder, from the views of entry-expression-model: the same markup is
 * rendered with the editor and inserted when a block changes. No Foundry APIs; the controller owns the events.
 * Keep data-* attributes stable: they are the interface to entry-expression-serialization. */
const options=list=>list.map(o=>`<option value="${escape(o.id)}" data-rta-colors="${escape(o.colors??"")}"${o.selected?" selected":""}>${o.labelKey?k(o.labelKey,o.fallback??o.id):escape(o.label??o.id)}</option>`).join("");
const hidden=shown=>shown?"":" hidden";
const editor=(kind,slot,body,parts=false)=>`<span${parts?' class="rta-rule-operand__parts"':""} data-rule-operand-editor="${kind}"${hidden(slot.show[kind])}>${body}</span>`;
const label=({key,fallback,number})=>`${k(key,fallback)}${number?` ${number}`:""}`;
const trash=(action,titleKey,title)=>`<button type="button" data-action="${action}" class="rta-config-action" title="${k(titleKey,title)}" aria-label="${k(titleKey,title)}"><i class="fa-solid fa-trash"></i></button>`;

/** One slot: its label, its kind, the controls of each kind, and the nested block of a calculation. */
export function renderExpressionSlotHTML(slot,{contextListId=""}={}){
  const controls=`<select data-rule-operand-kind aria-label="${k("RTA.Expression.Kind","Kind of operand")}">${options(slot.kindChoices)}</select>`
    +editor("literal",slot,`<input data-operand-part="value" value="${escape(slot.literalValue)}">`)
    +editor("parameter",slot,`<select data-operand-part="id">${options(slot.parameterChoices)}</select>`)
    +editor("formula",slot,`<select data-operand-part="id">${options(slot.formulaChoices)}</select>`)
    +editor("reference",slot,`<select data-operand-part="token">${options(slot.referenceChoices)}</select><select data-operand-part="container" aria-label="${k("RTA.Operand.ReadOn","Read on")}">${options(slot.referenceRoleChoices)}</select>`,true)
    +editor("context",slot,`<input data-operand-part="path" value="${escape(slot.contextPath)}" placeholder="variables.test.total"${contextListId?` list="${escape(contextListId)}"`:""}>`)
    +editor("contentField",slot,`<select data-operand-part="field">${options(slot.contentFieldChoices)}</select><input data-operand-part="fallback" value="${escape(slot.contentFieldFallback)}" placeholder="${k("RTA.Operand.FieldFallback","If the Content has none")}">`,true)
    +editor("dice",slot,`<select data-operand-part="read">${options(slot.diceReadChoices)}</select><input data-operand-part="group" value="${escape(slot.diceGroup)}" placeholder="${k("RTA.Operand.AllGroups","Every group")}"><span data-dice-compare-only${hidden(!slot.diceIsCounter)}><select data-operand-part="compare">${options(slot.diceCompareChoices)}</select></span><span data-dice-compare-only${hidden(!slot.diceIsCounter)}><input type="number" step="any" data-operand-part="value" value="${escape(slot.diceValue)}" placeholder="${k("RTA.Operand.FaceValue","Face value")}"></span><span data-dice-counter-only${hidden(slot.diceIsCounter)}><select data-operand-part="counter">${options(slot.diceCounterChoices)}</select></span>`,true)
    +editor("distance",slot,`<select data-operand-part="from">${options(slot.distanceFromChoices)}</select><select data-operand-part="to">${options(slot.distanceToChoices)}</select>`,true)
    +editor("nearby",slot,`<select data-operand-part="of">${options(slot.nearbyOfChoices)}</select><input type="number" min="0" step="any" data-operand-part="within" value="${escape(slot.nearbyWithin)}" placeholder="${k("RTA.Operand.Within","Within distance")}"><select data-operand-part="side">${options(slot.nearbySideChoices)}</select>`,true)
    +editor("actor",slot,`<select data-operand-part="of">${options(slot.actorOfChoices)}</select><select data-operand-part="is">${options(slot.actorIsChoices)}</select>`,true)
    +editor("systemData",slot,`<select data-operand-part="of">${options(slot.systemDataOfChoices)}</select><input data-operand-part="path" value="${escape(slot.systemDataPath)}" placeholder="system.attributes.ac.value"><input data-operand-part="fallback" value="${escape(slot.systemDataFallback)}" placeholder="${k("RTA.Operand.SystemDataFallback","If it has none")}">`,true)
    +editor("expression",slot,slot.block?`<select data-expr-operation aria-label="${k("RTA.Template.Operation","Operation")}">${options(slot.block.operationChoices)}</select>`:"")
    +(slot.removable?trash("removeRuleOperand","RTA.Template.RemoveOperand","Remove operand"):"");
  return `<div class="rta-rule-operand rta-form-row" data-rule-operand data-kind="${escape(slot.kind)}" data-expr-path="${escape(slot.path)}"><label class="rta-rule-operand__label">${label(slot.label)}</label><div class="rta-rule-operand__controls">${controls}</div>${slot.block?renderExpressionBlockHTML(slot.block,{contextListId}):""}</div>`;
}

/** The rows of a Table of ranges (from, to, result) or of a Table of values (key, result). */
function renderRowsHTML(block){
  const range=block.isRange,head=range?[["RTA.Expression.Row.From","From"],["RTA.Expression.Row.To","To"]]:[["RTA.Expression.Row.Key","Key"]];
  const cell=(row,part,[key,fallback],number)=>`<input${number?' type="number" step="any"':""} data-row-part="${part}" value="${escape(row[part]??"")}" aria-label="${k(key,fallback)}">`;
  const rows=block.rows.map(row=>`<div class="rta-expr-row" data-expr-row data-expr-path="${escape(row.path)}">${range?cell(row,"min",head[0],true)+cell(row,"max",head[1],true):cell(row,"key",head[0])}${cell(row,"value",["RTA.Expression.Row.Result","Result"])}${row.removable?trash("removeExprRow","RTA.Expression.Row.Remove","Remove row"):"<span></span>"}</div>`).join("");
  return `<div class="rta-expr-rows${range?" rta-expr-rows--range":""}" data-expr-rows><div class="rta-expr-row rta-expr-row--head">${[...head,["RTA.Expression.Row.Result","Result"]].map(([key,fallback])=>`<span>${k(key,fallback)}</span>`).join("")}<span></span></div>${rows}<button type="button" data-action="addExprRow"><i class="fa-solid fa-plus"></i> ${range?k("RTA.Expression.Row.AddRange","Add range"):k("RTA.Expression.Row.AddEntry","Add value")}</button></div>`;
}

/** A block: its slots in order (with the rows of a table between the value and the default) and Add operand. */
export function renderExpressionBlockHTML(block,{contextListId="",root=false}={}){
  const slots=list=>list.map(slot=>renderExpressionSlotHTML(slot,{contextListId})).join("");
  return `<div class="rta-expr-block${root?" rta-expr-block--root":""}" data-expr-block>${slots(block.leadSlots)}${block.isRange||block.isTable?renderRowsHTML(block):""}${slots(block.trailSlots)}`
    +`${block.isArgs?`<button type="button" data-action="addRuleOperand"><i class="fa-solid fa-plus"></i> ${k("RTA.Template.AddOperand","Add operand")}</button>`:""}</div>`;
}

/** The whole builder: the root operation, its block, and the context paths offered to every Context value. */
export function renderExpressionBuilderHTML(model,{contextListId="",contextPaths=[]}={}){
  if(!model.supported)return "";
  const name=model.editor==="condition"?"conditionOperator":"formulaOperator";
  const list=contextListId?`<datalist id="${escape(contextListId)}">${contextPaths.map(path=>`<option value="${escape(path.value)}" label="${k(path.hintKey,path.value)}${path.name?` · ${escape(path.name)}`:""}"></option>`).join("")}</datalist>`:"";
  return `<div class="rta-expr-root" data-expr-root><div class="form-group rta-form-row"><label>${k("RTA.Template.Operation","Operation")}</label><select name="${name}" data-expr-operation>${options(model.root.operationChoices)}</select></div>${renderExpressionBlockHTML(model.root,{contextListId,root:true})}${list}</div>`;
}
