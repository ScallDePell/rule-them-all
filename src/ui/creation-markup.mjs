/* Character creation in play (CP-15): the wizard a player follows step by step. Pure: creationView builds what
   the page shows from a CreationContext (game.ruleThemAll.creation.context) and the Ruleset; renderCreationHTML
   writes it. Data contract read by the window (runtime/foundry-creation.mjs):
   [data-creation-goto] step buttons, [data-creation-option] selected objects, [data-creation-choice] a Content's
   choices (data-template, data-group), [data-creation-points] value reached on a Definition (data-start: its value before the points), [data-creation-step] −/+, [data-creation-command]
   previous / next / draw / term / finish / abandon / start / resume, [data-creation-name] the character's name,
   [data-creation-actor-type] its Actor subtype when the game system has several. */
import {escapeHTML as escape} from "./html-utils.mjs";

const COLLECTION_OF = {choice: null, content: "contentTemplates"};
const nameOf = (ruleset, collection, id, t) => t((ruleset[collection] ?? []).find(entry => entry.id === id)?.nameKey ?? id);
const format = (t, key, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key));

/** "Choose 2", "Choose 1 to 3", "Choose up to 4". */
function boundsText({min = 0, max = 1} = {}, t) {
  if (min === max) return format(t, "RTA.Creation.ChooseExactly", {count: min});
  if (min === 0) return format(t, "RTA.Creation.ChooseUpTo", {count: max});
  return format(t, "RTA.Creation.ChooseBetween", {min, max});
}

/** The answer of a step for the term in progress (a repeated step keeps one answer per term). */
function currentAnswer(step, session) {
  if (!step.repeated) return step.answer;
  return step.answer?.terms?.[session.currentTerm ?? 0] ?? null;
}

/** What the wizard shows. context: {session, steps, complete, preview}; t: Ruleset text first. */
export function creationView(context, ruleset, t) {
  const {session, steps} = context, system = (ruleset.creationSystems ?? []).find(entry => entry.id === session.creationSystemId);
  const index = Math.max(0, steps.findIndex(step => step.current)), step = steps[index];
  const answer = step ? currentAnswer(step, session) : null, answered = answer !== null && answer !== undefined;
  const view = {title: t(system?.nameKey ?? session.creationSystemId), complete: context.complete, index, count: steps.length,
    steps: steps.map((entry, i) => ({id: entry.id, label: t(entry.name ?? entry.id), number: i + 1, current: entry.current, skipped: entry.skipped,
      state: entry.skipped ? "skipped" : entry.answer === null || entry.answer === undefined ? "open" : entry.valid ? "done" : "error"})),
    step: null};
  if (!step) return view;
  const panel = {id: step.id, kind: step.kind, label: t(step.name ?? step.id), skipped: step.skipped, errors: answered || step.kind === "review" ? step.errors : [],
    term: step.repeated ? (session.currentTerm ?? 0) + 1 : null, canNextTerm: step.endsBlock === true, first: index === 0, last: index === steps.length - 1,
    canDraw: Boolean(step.draw) && !(step.draw.locked && answer?.drawn), drawn: answer?.drawn === true};
  if (["choice", "content"].includes(step.kind)) {
    const collection = step.source?.collection ?? COLLECTION_OF[step.kind], selected = new Set(Array.isArray(answer) ? answer : answer?.selectedIds ?? []);
    const ids = step.options ? step.options.map(option => option.id) : step.source?.objectIds ?? [];
    panel.bounds = step.bounds ?? {min: step.min ?? 0, max: step.max ?? 1};
    panel.boundsText = boundsText(panel.bounds, t);
    panel.options = ids.map(id => ({id, label: nameOf(ruleset, collection, id, t), checked: selected.has(id)}));
    // A chosen Content may ask for its own choices (two skills among four).
    panel.groups = collection === "contentTemplates" ? [...selected].flatMap(templateId => {
      const template = (ruleset.contentTemplates ?? []).find(entry => entry.id === templateId), picked = answer?.contentChoices?.[templateId] ?? {};
      return (template?.choiceGroups ?? []).map(group => ({templateId, id: group.id, label: `${t(template.nameKey ?? templateId)} · ${t(group.name ?? group.id)}`, boundsText: boundsText(group, t), max: group.max,
        options: (group.options ?? []).map(option => ({id: option.id, label: option.targetRef ? nameOf(ruleset, option.targetRef.objectKind === "definition" ? "definitions" : "contentTemplates", option.targetRef.objectId, t) : option.id, checked: (picked[group.id] ?? []).includes(option.id)}))}));
    }) : [];
  }
  if (step.kind === "allocation") {
    const points = answer?.allocations ?? {}, bounds = step.bounds ?? {min: step.min ?? 0, max: step.max ?? 0};
    panel.boundsText = step.costFormulaRef ? format(t, "RTA.Creation.Budget", {min: bounds.min, max: bounds.max}) : bounds.min === bounds.max ? format(t, "RTA.Creation.SpendExactly", {count: bounds.max}) : format(t, "RTA.Creation.SpendBetween", {min: bounds.min, max: bounds.max});
    panel.perTarget = Number.isInteger(step.perTargetMax) ? step.perTargetMax : null;
    // The field shows the value reached: what the earlier choices give (a Content granting 1) plus the points spent.
    const start = id => Number(context.starting?.[id]?.["value.base"] ?? 0) || 0;
    panel.rows = (step.source?.objectIds ?? []).map(id => ({id, label: nameOf(ruleset, "definitions", id, t), start: start(id), points: Number(points[id] ?? 0)}));
    panel.spent = panel.rows.reduce((sum, row) => sum + row.points, 0);
    panel.costed = Boolean(step.costFormulaRef);
    // Without a cost Formula the budget is in points, so + greys out once it is spent; a drawn step keeps what the dice gave.
    panel.budget = !panel.costed && !answer?.drawn && Number.isFinite(bounds.max) ? bounds.max : null;
  }
  if (step.kind === "roll") { panel.total = answered ? answer.total : null; panel.result = answered ? answer.result ?? "" : ""; panel.canDraw = !answered; }
  if (step.kind === "review") {
    panel.summary = steps.filter(entry => entry.kind !== "review" && !entry.skipped).map(entry => ({label: t(entry.name ?? entry.id), value: summaryOf(entry, ruleset, t)}));
    panel.canFinish = context.complete;
  }
  view.step = panel;
  return view;
}

/** One line per step for the review: what was chosen, points spent, the roll. */
function summaryOf(step, ruleset, t) {
  const answers = step.repeated ? (step.answer?.terms ?? []).filter(Boolean) : [step.answer].filter(answer => answer !== null && answer !== undefined);
  const parts = answers.flatMap(answer => {
    if (step.kind === "roll") return [String(answer.total)];
    if (step.kind === "allocation") return Object.entries(answer.allocations ?? {}).filter(([, points]) => points > 0).map(([id, points]) => `${nameOf(ruleset, "definitions", id, t)} +${points}`);
    const collection = step.source?.collection ?? COLLECTION_OF[step.kind];
    return (Array.isArray(answer) ? answer : answer.selectedIds ?? []).map(id => nameOf(ruleset, collection, id, t));
  });
  return parts.length ? parts.join(", ") : "—";
}

const button = (command, label, {primary = false, disabled = false} = {}) => `<button type="button" data-creation-command="${command}"${primary ? ' class="rta-creation__primary"' : ""}${disabled ? " disabled" : ""}>${escape(label)}</button>`;

function optionList(options, {name, extra = "", single}) {
  return `<div class="rta-creation__options"${single ? " data-creation-single" : ""}>${options.map(option => `<label class="rta-creation__option"><input type="checkbox" ${name} value="${escape(option.id)}"${extra}${option.checked ? " checked" : ""}> <span>${escape(option.label)}</span></label>`).join("")}</div>`;
}

function panelHTML(step, t, {name = "", actorTypes = [], actorType = ""} = {}) {
  const parts = [`<header class="rta-creation__panel-head"><h3 class="rta-creation__title">${escape(step.label)}</h3>${step.term ? `<span class="rta-creation__term">${escape(format(t, "RTA.Creation.Term", {number: step.term}))}</span>` : ""}</header>`];
  if (step.skipped) parts.push(`<p class="rta-creation__hint">${escape(t("RTA.Creation.Skipped"))}</p>`);
  else if (step.options) {
    parts.push(`<p class="rta-creation__hint">${escape(step.boundsText)}</p>`);
    parts.push(step.options.length ? optionList(step.options, {name: "data-creation-option", single: step.bounds.max === 1}) : `<p class="rta-creation__hint">${escape(t("RTA.Creation.NoOption"))}</p>`);
    for (const group of step.groups) parts.push(`<fieldset class="rta-creation__group"><legend>${escape(group.label)}</legend><p class="rta-creation__hint">${escape(group.boundsText)}</p>${optionList(group.options, {name: "data-creation-choice", extra: ` data-template="${escape(group.templateId)}" data-group="${escape(group.id)}"`, single: group.max === 1})}</fieldset>`);
  } else if (step.rows) {
    parts.push(`<p class="rta-creation__hint">${escape(step.boundsText)}${step.costed ? "" : ` <span data-creation-spent>${escape(format(t, "RTA.Creation.Spent", {count: step.spent}))}</span>`}</p>`);
    const stepper = (row, delta, label) => `<button type="button" class="rta-creation__stepper" data-creation-step="${delta}" aria-label="${escape(`${label} ${row.label}`)}">${delta < 0 ? "−" : "+"}</button>`;
    parts.push(`<div class="rta-creation__points"${step.budget !== null ? ` data-creation-budget="${step.budget}"` : ""}>${step.rows.map(row => `<div class="rta-creation__point"><label for="rta-creation-points-${escape(row.id)}">${escape(row.label)}</label><span class="rta-creation__value">${stepper(row, -1, t("RTA.Creation.Less"))}<input type="number" id="rta-creation-points-${escape(row.id)}" min="${row.start}" step="1"${step.perTarget !== null ? ` max="${row.start + step.perTarget}"` : ""} data-creation-points="${escape(row.id)}" data-start="${row.start}" value="${row.start + row.points}">${stepper(row, 1, t("RTA.Creation.More"))}</span></div>`).join("")}</div>`);
  } else if (step.kind === "roll") {
    parts.push(step.total === null ? `<p class="rta-creation__hint">${escape(t("RTA.Creation.NotRolled"))}</p>` : `<p class="rta-creation__roll"><span>${escape(step.result)}</span> <strong>${escape(String(step.total))}</strong></p>`);
  } else if (step.summary) {
    parts.push(`<dl class="rta-creation__summary">${step.summary.map(line => `<dt>${escape(line.label)}</dt><dd>${escape(line.value)}</dd>`).join("")}</dl>`);
    parts.push(`<label class="rta-creation__name"><span>${escape(t("RTA.Creation.Name"))}</span><input type="text" data-creation-name value="${escape(name)}"></label>`);
    // The game system's Actor subtypes, when it has several (character, npc…): the new Actor needs one.
    if (actorTypes.length > 1) parts.push(`<label class="rta-creation__name"><span>${escape(t("RTA.Creation.ActorType"))}</span><select data-creation-actor-type>${actorTypes.map(type => `<option value="${escape(type.value)}"${type.value === actorType ? " selected" : ""}>${escape(type.label)}</option>`).join("")}</select></label>`);
  }
  if (step.errors.length) parts.push(`<ul class="rta-creation__errors">${step.errors.map(error => `<li>${escape(error)}</li>`).join("")}</ul>`);
  const tools = [];
  if (step.canDraw && !step.skipped) tools.push(button("draw", t(step.kind === "roll" ? "RTA.Creation.Roll" : "RTA.Creation.Draw")));
  if (step.canNextTerm) tools.push(button("term", t("RTA.Creation.AnotherTerm")));
  if (tools.length) parts.push(`<div class="rta-creation__tools">${tools.join("")}</div>`);
  return parts.join("");
}

/** The wizard page: steps on the side, the step in progress, then the way on. */
export function renderCreationHTML(view, {t, name = "", actorTypes = [], actorType = ""}) {
  const step = view.step;
  const steps = view.steps.map(entry => `<li><button type="button" class="rta-creation__step" data-creation-goto="${escape(entry.id)}" data-state="${entry.state}"${entry.current ? ' aria-current="step"' : ""}><span class="rta-creation__number">${entry.number}</span><span class="rta-creation__step-label">${escape(entry.label)}</span></button></li>`).join("");
  const footer = step ? `<footer class="rta-creation__footer">${button("abandon", t("RTA.Creation.Abandon"))}<span class="rta-creation__spacer"></span>${button("previous", t("RTA.Creation.Previous"), {disabled: step.first})}${step.kind === "review" ? button("finish", t("RTA.Creation.Finish"), {primary: true, disabled: !step.canFinish}) : button("next", t(step.last ? "RTA.Creation.Save" : "RTA.Creation.Next"), {primary: true})}</footer>` : "";
  return `<div class="rta-creation"><div class="rta-creation__layout"><nav class="rta-creation__nav" aria-label="${escape(view.title)}"><ol class="rta-creation__steps">${steps}</ol></nav><section class="rta-creation__panel">${step ? panelHTML(step, t, {name, actorTypes, actorType}) : ""}</section></div>${footer}</div>`;
}

/** First page: the creations left unfinished, and the Creation Systems to start one. */
export function renderCreationStartHTML({drafts = [], systems = []}, {t}) {
  const draftRows = drafts.map(draft => `<li class="rta-creation__draft"><span>${escape(draft.label)}</span><button type="button" data-creation-command="resume" data-session="${escape(draft.id)}">${escape(t("RTA.Creation.Resume"))}</button><button type="button" data-creation-command="abandon" data-session="${escape(draft.id)}">${escape(t("RTA.Creation.Abandon"))}</button></li>`).join("");
  const systemRows = systems.map(system => `<li class="rta-creation__draft"><span>${escape(system.label)}</span><button type="button" class="rta-creation__primary" data-creation-command="start" data-system="${escape(system.id)}">${escape(t("RTA.Creation.Start"))}</button></li>`).join("");
  return `<div class="rta-creation rta-creation--start">${drafts.length ? `<section class="rta-creation__section"><h3 class="rta-creation__title">${escape(t("RTA.Creation.Drafts"))}</h3><ul class="rta-creation__drafts">${draftRows}</ul></section>` : ""}<section class="rta-creation__section"><h3 class="rta-creation__title">${escape(t("RTA.Creation.NewCharacter"))}</h3>${systems.length ? `<ul class="rta-creation__drafts">${systemRows}</ul>` : `<p class="rta-creation__hint">${escape(t("RTA.Creation.NoSystem"))}</p>`}</section></div>`;
}

/** Points spent on one field: the value typed minus the value it starts from. */
const pointsOf = input => { const points = Math.trunc(Number(input.value)) - (Number(input.dataset.start) || 0); return Number.isFinite(points) ? Math.max(0, points) : 0; };

/** Points spent on the allocation step shown in root. */
export function spentPoints(root) { return [...root.querySelectorAll("[data-creation-points]")].reduce((sum, input) => sum + pointsOf(input), 0); }

/** The −/+ buttons: − greys out at the starting value, + at the field's maximum or once the budget is spent. */
export function refreshSteppers(root) {
  const budget = root.querySelector("[data-creation-budget]")?.dataset.creationBudget, full = budget !== undefined && spentPoints(root) >= Number(budget);
  for (const input of root.querySelectorAll("[data-creation-points]")) {
    const value = Math.trunc(Number(input.value)) || 0, box = input.parentElement;
    box.querySelector('[data-creation-step="-1"]').disabled = value <= Number(input.min);
    box.querySelector('[data-creation-step="1"]').disabled = full || (input.max !== "" && value >= Number(input.max));
  }
}

/** One click on − or +: the field moves by one within its bounds (and the budget for +). */
export function stepPoints(button) {
  const input = button.parentElement.querySelector("[data-creation-points]"), delta = Number(button.dataset.creationStep);
  const value = (Math.trunc(Number(input.value)) || 0) + delta;
  if (value < Number(input.min) || (input.max !== "" && value > Number(input.max))) return false;
  input.value = String(value);
  return true;
}

/** The answer the page holds for the step in progress, in the shape CreationSessions.answer expects. */
export function readCreationAnswer(root, step) {
  if (step.rows) {
    const allocations = {};
    for (const input of root.querySelectorAll("[data-creation-points]")) { const points = pointsOf(input); if (points > 0) allocations[input.dataset.creationPoints] = points; }
    return {allocations};
  }
  if (step.options) {
    const selectedIds = [...root.querySelectorAll("[data-creation-option]:checked")].map(input => input.value), contentChoices = {};
    for (const input of root.querySelectorAll("[data-creation-choice]:checked")) ((contentChoices[input.dataset.template] ??= {})[input.dataset.group] ??= []).push(input.value);
    return {selectedIds, ...(Object.keys(contentChoices).length ? {contentChoices} : {})};
  }
  return null;
}
