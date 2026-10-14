// Visual QA of played sheets: renders a few projected sheets with the module CSS (and Foundry's, with RTA_FOUNDRY_CSS)
// and checks them in Chromium: no horizontal overflow, no clipped label (a long Definition name in a list is cut
// with its full name as a tooltip), controls aligned in each list, checkboxes at Foundry's size, and a sheet taller
// than its window scrolls under its header (Foundry's .window-content hides what overflows).
// Usage: RTA_CHROMIUM=<chrome> [RTA_FOUNDRY_CSS=<foundry.css>] [RTA_SHOTS=<dir>] node qa/sheet-render.mjs <repo> <outDir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] ?? '.'), out = resolve(process.argv[3] ?? 'qa-out/sheets');
mkdirSync(out, {recursive: true});
const load = path => import(pathToFileURL(join(root, path)).href);
const {createConfiguratorAPI} = await load('src/configurator/configurator-api.mjs');
const {emptyStorageSnapshot} = await load('src/configurator/configurator-storage.mjs');
const {MemoryRuntimeAdapter} = await load('src/runtime/memory-runtime-adapter.mjs');
const {RuntimeEngine} = await load('src/runtime/runtime-engine.mjs');
const {projectSheet} = await load('src/runtime/sheet-projection.mjs');
const {sheetFor} = await load('src/configurator/sheet-auto-layout.mjs');
const {renderSheetHTML, renderActionChatHTML} = await load('src/ui/sheet-markup.mjs');

class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
const api = await createConfiguratorAPI(new Storage());
const v = (await api.createRuleset({id: 'qa', nameKey: 'QA', version: '1'})).versionId;
const out_ = (objectId, capabilityId, outputId, slotId) => ({objectKind: 'definition', objectId, capabilityId, outputId, ...(slotId ? {slotId} : {})});
const field = (id, name, valueType) => ({id, name, valueType, cardinality: 'one', nullable: false, required: false, constraints: []});
await api.registerDefinitionType(v, {id: 'attribute', key: 'attribute', nameKey: 'Attributes', allowedCapabilities: ['value'], defaultCapabilities: ['value'], requiredCapabilities: [], fields: {}});
await api.registerDefinitionType(v, {id: 'resource', key: 'resource', nameKey: 'Resources', allowedCapabilities: ['pool'], defaultCapabilities: ['pool'], requiredCapabilities: [], fields: {}});
await api.registerDefinitionType(v, {id: 'skill', key: 'skill', nameKey: 'Skills', allowedCapabilities: ['value', 'state'], defaultCapabilities: ['value'], requiredCapabilities: [], fields: {}});
for (const [id, name] of [['str', 'Strength'], ['dex', 'Dexterity'], ['wit', 'Wits'], ['will', 'Willpower']]) await api.createDefinition(v, {id, key: id, definitionTypeId: 'attribute', nameKey: name, data: {}, capabilities: ['value']});
await api.createDefinition(v, {id: 'hp', key: 'hp', definitionTypeId: 'resource', nameKey: 'Health', data: {}, capabilities: ['pool'], slots: {pool: [{id: 'points', name: 'Health points', minimum: {literal: 0}, maximum: {literal: 12}}]}});
await api.createDefinition(v, {id: 'luck', key: 'luck', definitionTypeId: 'resource', nameKey: 'Luck', data: {}, capabilities: ['pool'], slots: {pool: [{id: 'points', name: 'Luck points', minimum: {literal: 0}, maximum: {literal: 3}}]}});
for (const [id, name] of [['climb', 'Climb'], ['swim', 'Swim'], ['spot', 'Spot hidden things in the dark'], ['ride', 'Ride'], ['lore', 'Lore'], ['heal', 'First aid'], ['hide', 'Hide']]) await api.createDefinition(v, {id, key: id, definitionTypeId: 'skill', nameKey: name, data: {}, capabilities: ['value', 'state']});
await api.createFormula(v, {id: 'defence', nameKey: 'Defence', resultType: 'number', expression: {type: 'add', args: [{type: 'literal', value: 10}, {type: 'reference', reference: out_('dex', 'value', 'value.final')}]}});
for (const [id, name] of [['rest', 'Rest'], ['attack', 'Attack'], ['sneak', 'Sneak']]) await api.createAction(v, {id, nameKey: name, effectRefs: []});
await api.createContentType(v, {id: 'weapon', nameKey: 'Weapon', storageKind: 'item', runtimeMode: 'unique', fields: {damage: field('damage', 'Damage', 'string'), reach: field('reach', 'Reach', 'number'), equipped: field('equipped', 'Equipped', 'boolean')}});
await api.createContentTemplate(v, {id: 'sword', nameKey: 'Sword', contentTypeId: 'weapon', data: {damage: '1d8', reach: 1, equipped: true}, relations: [], choiceGroups: []});
await api.createScale(v, {id: 'health', nameKey: 'Health', basis: 'percent', rows: [{id: 'full', labelKey: 'Seems in great shape', min: 100, max: null}, {id: 'hurt', labelKey: 'Somewhat hurt', min: 50, max: 99.99}, {id: 'bad', labelKey: 'Badly hurt', min: 1, max: 49.99}, {id: 'down', labelKey: 'Down', min: null, max: 0}]});
await api.updateDefinitionType(v, 'resource', {scaleRef: 'health'});
// Advancements bought with XP (an attribute costs twice its next value, at most 15; a skill 5 points), and two levels.
await api.registerDefinitionType(v, {id: 'experience', key: 'experience', nameKey: 'Experience', allowedCapabilities: ['value'], defaultCapabilities: ['value'], requiredCapabilities: [], fields: {}});
await api.createDefinition(v, {id: 'xp', key: 'xp', definitionTypeId: 'experience', nameKey: 'Experience points', data: {}, capabilities: ['value']});
await api.createFormula(v, {id: 'attr-cost', nameKey: 'Attribute cost', resultType: 'number', expression: {type: 'multiply', args: [{type: 'literal', value: 2}, {type: 'context', path: 'variables.advance.next'}]}});
await api.createFormula(v, {id: 'skill-cost', nameKey: 'Skill cost', resultType: 'number', expression: {type: 'literal', value: 5}});
await api.createFormula(v, {id: 'attr-max', nameKey: 'Attribute maximum', resultType: 'number', expression: {type: 'literal', value: 14}});
for (const [id, name, xp] of [['seasoned', 'Seasoned', 20], ['veteran', 'Veteran', 200]]) await api.createCondition(v, {id, nameKey: name, expression: {type: 'gte', left: {type: 'reference', reference: out_('xp', 'value', 'value.final')}, right: {type: 'literal', value: xp}}});
await api.createProgressionSystem(v, {id: 'growth', nameKey: 'Growth', advancements: [
  {id: 'attr', labelKey: 'Attribute advance', definitionTypeId: 'attribute', currencyRef: out_('xp', 'value', 'value.base'), costFormulaRef: 'attr-cost', maximumFormulaRef: 'attr-max'},
  {id: 'skill', labelKey: 'Skill advance', definitionTypeId: 'skill', currencyRef: out_('xp', 'value', 'value.base'), costFormulaRef: 'skill-cost', step: 5}],
  milestones: [{id: 'seasoned', labelKey: 'Seasoned', conditionRef: 'seasoned', definitionIds: ['hide']}, {id: 'veteran', labelKey: 'Veteran', conditionRef: 'veteran', definitionIds: ['swim']}]});
// A block template drawing each weapon held as a card: its picture, its name and two of its fields.
await api.createSheetTemplate(v, {id: 'weapon-card', nameKey: 'Weapon card', root: {id: 'card', kind: 'section', columns: 2, children: [
  {id: 'card-face', kind: 'portrait', height: 'small'}, {id: 'card-name', kind: 'name'},
  {id: 'card-damage', kind: 'value', source: {kind: 'field', fieldId: 'damage'}}, {id: 'card-reach', kind: 'value', source: {kind: 'field', fieldId: 'reach'}}]}});
await api.publishRuleset(v);

const adapter = new MemoryRuntimeAdapter(), engine = new RuntimeEngine({configurator: api, adapter, hooks: null}), hero = {kind: 'actor', id: 'hero'};
await engine.initializeContainer(v, hero, {definitionIds: ['str', 'dex', 'wit', 'will', 'hp', 'luck', 'climb', 'spot', 'ride', 'lore', 'heal', 'xp']});
for (const [id, base] of [['str', 12], ['dex', 9], ['wit', 14], ['will', 10], ['climb', 45], ['spot', 60], ['xp', 24]]) await engine.setDefinitionState(v, hero, id, {base});
await engine.setDefinitionState(v, hero, 'hp', {pools: {points: 8}});
await engine.setDefinitionState(v, hero, 'climb', {active: true});
const state = await adapter.load(hero, {rulesetVersionId: v}); state.contents = {'sword-1': {templateId: 'sword', contentTypeId: 'weapon', fields: {damage: '1d8+1', reach: 1, equipped: true}}};
await adapter.write(hero, {state, ledger: await adapter.loadLedger(hero)});
const ruleset = engine.ruleset(v);

const tabbed = {id: 'tabbed', target: 'actor', root: {id: 'root', kind: 'tabs', children: [
  {id: 'main', kind: 'tab', labelKey: 'Character', icon: 'fa-user', children: [{id: 'top', kind: 'grid', columns: 2, children: [
    {id: 'attrs', kind: 'section', labelKey: 'Attributes', columns: 2, children: ['str', 'dex', 'wit', 'will'].map(id => ({id: `a-${id}`, kind: 'value', source: {kind: 'output', reference: out_(id, 'value', 'value.final')}, write: {operation: 'set'}}))},
    {id: 'state', kind: 'section', labelKey: 'Condition', icon: 'fa-heart-pulse', columns: 1, children: [
      {id: 'hurt', kind: 'value', labelKey: 'Health', icon: 'fa-heart', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, write: {operation: 'subtract'}},
      {id: 'heal', kind: 'value', labelKey: 'Luck', source: {kind: 'output', reference: out_('luck', 'pool', 'pool.current', 'points')}, write: {operation: 'add'}},
      {id: 'def', kind: 'value', source: {kind: 'formula', formulaRef: 'defence'}}]},
    {id: 'note', kind: 'text', span: 2, textKey: 'Values in bold are computed by the Ruleset.'}]}]},
  {id: 'skills-tab', kind: 'tab', labelKey: 'Skills', children: [{id: 'skills', kind: 'repeater', query: {definitionTypeId: 'skill'}, columns: 3, children: [
    {id: 'rank', kind: 'value', source: {kind: 'each', capabilityId: 'value', outputId: 'value.final'}, write: {operation: 'set'}},
    {id: 'mark', kind: 'value', source: {kind: 'each', capabilityId: 'state', outputId: 'state.active'}, write: {operation: 'set'}},
    {id: 'roll', kind: 'action', actionRef: 'sneak', labelKey: 'Roll', icon: 'fa-dice-d20', labelShow: 'icon'}]}]}]}};

// Styles set in the sheet editor: tones, an own color with its opacity, a font, labels above and hidden, spacing.
const styled = {id: 'styled', target: 'actor', root: {id: 'root', kind: 'grid', columns: 2, style: {gap: 'block'}, children: [
  {id: 'banner', kind: 'text', span: 2, textKey: 'Ayla, ranger of the north', style: {size: 'huge', align: 'center', font: 'Amiri', color: 'accent'}},
  {id: 'attrs', kind: 'section', labelKey: 'Attributes', columns: 2, style: {background: '#3a2a50', opacity: 70, border: 'highlight', color: 'light'}, children: ['str', 'dex', 'wit', 'will'].map(id => ({id: `s-${id}`, kind: 'value', source: {kind: 'output', reference: out_(id, 'value', 'value.final')}, write: {operation: 'set'}, style: {label: 'top', align: 'center'}}))},
  {id: 'quiet', kind: 'section', labelKey: 'Condition', columns: 1, style: {background: 'none', border: 'none', italic: true}, children: [
    {id: 'q-hp', kind: 'value', labelKey: 'Health', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, write: {operation: 'subtract'}, style: {bold: true, color: 'danger'}},
    {id: 'q-def', kind: 'value', source: {kind: 'formula', formulaRef: 'defence'}, style: {label: 'hidden', padding: 'tight', background: 'panel'}}]},
  // Dots, a gradient gauge, the Content held of a type, a round and a tall portrait, a value raised and lowered with − and +.
  {id: 'looks', kind: 'section', labelKey: 'At a glance', columns: 2, span: 2, children: [
    {id: 'portrait', kind: 'image', src: 'icons/svg/mystery-man.svg', shape: 'circle', height: 'small'},
    {id: 'held', kind: 'value', source: {kind: 'content', contentTypeId: 'weapon'}, style: {label: 'top'}},
    {id: 'd-will', kind: 'value', labelKey: 'Will', source: {kind: 'output', reference: out_('dex', 'value', 'value.final')}, display: 'dots', dots: 10, write: {operation: 'set'}},
    {id: 'g-hp', kind: 'value', labelKey: 'Health', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, display: 'gauge', write: {operation: 'adjust'}, style: {fill: 'danger', fillTo: '#5fa04b'}},
    {id: 'words', kind: 'value', labelKey: 'Health (seen by others)', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, display: 'description', style: {italic: true}},
    {id: 'tall', kind: 'image', src: 'icons/svg/mystery-man.svg', shape: 'portrait', height: 'small'},
    {id: 'a-wit', kind: 'value', labelKey: 'Wits', source: {kind: 'output', reference: out_('wit', 'value', 'value.final')}, write: {operation: 'adjust'}}]}]}};

// No standard header: the name, the portrait and the token image placed in the layout, styled like any block.
const custom = {id: 'custom', target: 'actor', header: 'none', root: {id: 'root', kind: 'grid', columns: 3, children: [
  {id: 'face', kind: 'portrait', shape: 'portrait', height: 'large'},
  {id: 'who', kind: 'section', columns: 2, span: 2, style: {background: 'none', border: 'none'}, children: [
    {id: 'name', kind: 'name', span: 2, style: {size: 'huge', font: 'Amiri', color: 'accent'}},
    {id: 'pawn', kind: 'token', shape: 'circle', height: 'small', updatePlaced: true},
    {id: 'c-def', kind: 'value', source: {kind: 'formula', formulaRef: 'defence'}},
    ...['str', 'dex'].map(id => ({id: `c-${id}`, kind: 'value', source: {kind: 'output', reference: out_(id, 'value', 'value.final')}, write: {operation: 'set'}}))]}]}};
// Pictures for the Document: a portrait and a round token (data URLs, so the page needs no file).
const picture = (fill, round) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120"><rect width="90" height="120" fill="${fill}"/>${round ? '<circle cx="45" cy="60" r="40" fill="#e8d9b0"/>' : '<circle cx="45" cy="45" r="22" fill="#e8d9b0"/><rect x="18" y="74" width="54" height="46" rx="20" fill="#e8d9b0"/>'}</svg>`)}`;
const doc = {img: picture('#5a4a7a', false), token: picture('#3b6b4a', true)};
// Themed sheets: the weapons held as cards (from the template, and from the fields chosen), a section in an image frame.
const frame = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90"><rect x="3" y="3" width="84" height="84" fill="none" stroke="#7a4f22" stroke-width="6"/><rect x="11" y="11" width="68" height="68" fill="none" stroke="#b8893c" stroke-width="2"/><circle cx="8" cy="8" r="7" fill="#7a4f22"/><circle cx="82" cy="8" r="7" fill="#7a4f22"/><circle cx="8" cy="82" r="7" fill="#7a4f22"/><circle cx="82" cy="82" r="7" fill="#7a4f22"/></svg>')}`;
const themed = (id, theme) => ({id, target: 'actor', theme, root: {id: 'root', kind: 'grid', columns: 2, children: [
  {id: 'attrs', kind: 'section', labelKey: 'Attributes', columns: 2, children: ['str', 'dex', 'wit', 'will'].map(id => ({id: `t-${id}`, kind: 'value', source: {kind: 'output', reference: out_(id, 'value', 'value.final')}, write: {operation: 'set'}}))},
  {id: 'state', kind: 'section', labelKey: 'Condition', columns: 1, style: {frame, frameSlice: 30, frameWidth: 'small'}, children: [
    {id: 't-hp', kind: 'value', labelKey: 'Health', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, display: 'gauge', write: {operation: 'adjust'}},
    {id: 't-def', kind: 'value', source: {kind: 'formula', formulaRef: 'defence'}},
    {id: 't-act', kind: 'action', actionRef: 'sneak', labelKey: 'Sneak', icon: 'fa-dice-d20'}]},
  {id: 'arms', kind: 'section', labelKey: 'Weapons', span: 2, columns: 1, children: [{id: 'arms-cards', kind: 'contents', contentTypeIds: ['weapon'], cards: {templateRef: 'weapon-card'}}]},
  {id: 'arms-fields', kind: 'section', labelKey: 'Weapons (fields)', span: 2, columns: 1, children: [{id: 'arms-list', kind: 'contents', contentTypeIds: ['weapon'], cards: {fieldIds: ['damage', 'reach']}}]}]}});
const held = [{id: 'sword-1', name: 'Grandfather\'s sword', img: picture('#6b3b2a', true), managed: true}];

const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const page = (body, theme) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative;display:flex;flex-direction:column;height:var(--qa-height,auto)}.window-content{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden}</style><body class="${theme}"><div class="application sheet ${theme}" style="width:var(--qa-width)"><section class="window-content">${body}</section></div></body></html>`;
const sheets = [
  ['actor-auto', await projectSheet(engine, v, sheetFor(ruleset, {target: 'actor'}), {actor: hero, items: [{id: 'sword-1', name: 'Grandfather\'s sword', img: '', managed: true}, {id: 'rope', name: 'Rope (15 m)', img: '', managed: false}]}), 'Ayla the Brave'],
  ['actor-tabbed', await projectSheet(engine, v, tabbed, {actor: hero}), 'Ayla the Brave'],
  ['actor-styled', await projectSheet(engine, v, styled, {actor: hero, items: [{id: 'sword-1', name: 'Grandfather\'s sword', img: '', managed: true}]}), 'Ayla the Brave'],
  ['actor-progression', await projectSheet(engine, v, {id: 'growth', target: 'actor', root: {id: 'root', kind: 'section', labelKey: 'Growth', columns: 1, children: [{id: 'buy', kind: 'progression', progressionSystemRef: 'growth'}]}}, {actor: hero}), 'Ayla the Brave'],
  ['item-owned', await projectSheet(engine, v, sheetFor(ruleset, {target: 'item', contentTypeId: 'weapon'}), {actor: hero, content: {key: 'sword-1'}}), 'Sword'],
  // Unlocked (the lock open in the window header): the name is a field, the camera buttons sit on the pictures.
  ['actor-auto-unlocked', await projectSheet(engine, v, sheetFor(ruleset, {target: 'actor'}), {actor: hero}), 'Ayla the Brave', {unlocked: true}],
  ['actor-custom', await projectSheet(engine, v, custom, {actor: hero}), 'Ayla the Brave'],
  ['actor-custom-unlocked', await projectSheet(engine, v, custom, {actor: hero}), 'Ayla the Brave', {unlocked: true}],
  ['actor-parchment', await projectSheet(engine, v, themed('parchment', {id: 'parchment'}), {actor: hero, items: held}), 'Ayla the Brave'],
  ['actor-gothic', await projectSheet(engine, v, themed('gothic', {id: 'gothic', overrides: {accent: '#c0392b', titleFont: 'Amiri', frame, frameWidth: 'small'}}), {actor: hero, items: held}), 'Ayla the Brave'],
  ['actor-scifi', await projectSheet(engine, v, themed('scifi', {id: 'scifi'}), {actor: hero, items: held}), 'Ayla the Brave'],
  ['actor-plain', await projectSheet(engine, v, themed('plain', {id: 'plain'}), {actor: hero, items: held}), 'Ayla the Brave']
];
const english = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
const t = key => key?.split('.').reduce((node, part) => node?.[part], english) ?? key;
const files = [];
for (const [name, view, title, options = {}] of sheets) for (const theme of ['theme-dark', 'theme-light']) {
  const file = join(out, `sheet-${name}-${theme}.html`);
  writeFileSync(file, page(renderSheetHTML(view, {t, name: title, editable: true, ...doc, ...options}), theme));
  files.push([`${name}-${theme}`, file]);
}
const chat = join(out, 'chat-card.html');
writeFileSync(chat, page(renderActionChatHTML({title: 'Attack', actor: 'Ayla', lines: [{label: '1d20+5', value: '14 + 5 = 19'}, {label: 'Target', value: '15'}], outcome: 'Hit'}), 'theme-dark'));
files.push(['chat-card', chat]);

const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox']});
const tab = await browser.newPage({viewport: {width: 700, height: 900}});
let problems = 0;
for (const [name, file] of files) for (const width of [640, 420]) {
  await tab.goto(pathToFileURL(file).href);
  await tab.evaluate(w => document.querySelector('.application').style.setProperty('--qa-width', `${w}px`), width);
  const report = await tab.evaluate(() => {
    const issues = [], content = document.querySelector('.window-content');
    if (content.scrollWidth > content.clientWidth + 1) issues.push(`horizontal overflow ${content.scrollWidth} > ${content.clientWidth}`);
    for (const el of document.querySelectorAll('.rta-sheet-value:not(.rta-sheet-value--label-hidden) .rta-sheet-value__label:not(.rta-sheet-visually-hidden), .rta-sheet-action, .rta-sheet-section__title'))
      if (el.scrollWidth > el.clientWidth + 1) issues.push(`clipped: ${el.textContent.trim()}`);
    for (const list of document.querySelectorAll('.rta-sheet-list:not([hidden] *)')) {
      const lefts = new Set([...list.querySelectorAll(':scope > .rta-sheet-row > .rta-sheet-grid')].map(g => Math.round(g.getBoundingClientRect().left)));
      if (lefts.size > 1) issues.push(`list columns not aligned: ${[...lefts]}`);
    }
    for (const box of document.querySelectorAll('.rta-sheet input[type="checkbox"]:not([hidden] *)')) { const r = box.getBoundingClientRect(); if (r.width < 10 || r.height < 10) issues.push(`checkbox ${r.width}x${r.height}`); }
    // The camera button sits in the bottom right corner of its picture.
    for (const camera of document.querySelectorAll('.rta-sheet-picture__edit')) {
      const c = camera.getBoundingClientRect(), p = camera.parentElement.getBoundingClientRect();
      if (Math.abs(c.right - p.right) > 1 || Math.abs(c.bottom - p.bottom) > 1 || c.width > p.width / 2) issues.push(`camera button not at the corner of its picture (${Math.round(c.right - p.right)}, ${Math.round(c.bottom - p.bottom)})`);
    }
    for (const picture of document.querySelectorAll('.rta-sheet-picture')) { const r = picture.getBoundingClientRect(); if (r.width < 16 || r.height < 16) issues.push(`picture ${r.width}x${r.height}`); }
    return issues;
  });
  // The same sheet in a short window: what does not fit is reached by scrolling the body.
  report.push(...await tab.evaluate(() => {
    document.querySelector('.application').style.setProperty('--qa-height', '360px');
    const body = document.querySelector('.rta-sheet__body'), content = document.querySelector('.window-content');
    const issues = [];
    if (body && body.scrollHeight > body.clientHeight + 1 && getComputedStyle(body).overflowY !== 'auto') issues.push('sheet body does not scroll');
    if (body && body.getBoundingClientRect().bottom > content.getBoundingClientRect().bottom + 1) issues.push('sheet body taller than its window');
    document.querySelector('.application').style.removeProperty('--qa-height');
    return issues;
  }));
  if (report.length) { problems += report.length; console.log(`${name} @${width}: ${report.join('; ')}`); }
  if (process.env.RTA_SHOTS) { mkdirSync(process.env.RTA_SHOTS, {recursive: true}); await tab.locator('.application').screenshot({path: join(process.env.RTA_SHOTS, `sheet-${name}-${width}.png`)}); }
}
// The tabbed sheet's second tab, as a player would open it.
if (process.env.RTA_SHOTS) {
  await tab.goto(pathToFileURL(join(out, 'sheet-actor-tabbed-theme-dark.html')).href);
  await tab.evaluate(() => { document.querySelector('.application').style.setProperty('--qa-width', '640px'); for (const p of document.querySelectorAll('[data-sheet-panel]')) p.hidden = p.dataset.sheetPanel !== 'skills-tab'; });
  await tab.locator('.application').screenshot({path: join(process.env.RTA_SHOTS, 'sheet-actor-tabbed-skills.png')});
}
await browser.close();
console.log(problems ? `sheet QA: ${problems} problem(s)` : 'sheet QA: no problem');
process.exitCode = problems ? 1 : 0;
