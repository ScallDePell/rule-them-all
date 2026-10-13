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
await api.publishRuleset(v);

const adapter = new MemoryRuntimeAdapter(), engine = new RuntimeEngine({configurator: api, adapter, hooks: null}), hero = {kind: 'actor', id: 'hero'};
await engine.initializeContainer(v, hero, {definitionIds: ['str', 'dex', 'wit', 'will', 'hp', 'luck', 'climb', 'spot', 'ride', 'lore', 'heal']});
for (const [id, base] of [['str', 12], ['dex', 9], ['wit', 14], ['will', 10], ['climb', 45], ['spot', 60]]) await engine.setDefinitionState(v, hero, id, {base});
await engine.setDefinitionState(v, hero, 'hp', {pools: {points: 8}});
await engine.setDefinitionState(v, hero, 'climb', {active: true});
const state = await adapter.load(hero, {rulesetVersionId: v}); state.contents = {'sword-1': {templateId: 'sword', contentTypeId: 'weapon', fields: {damage: '1d8+1', reach: 1, equipped: true}}};
await adapter.write(hero, {state, ledger: await adapter.loadLedger(hero)});
const ruleset = engine.ruleset(v);

const tabbed = {id: 'tabbed', target: 'actor', root: {id: 'root', kind: 'tabs', children: [
  {id: 'main', kind: 'tab', labelKey: 'Character', children: [{id: 'top', kind: 'grid', columns: 2, children: [
    {id: 'attrs', kind: 'section', labelKey: 'Attributes', columns: 2, children: ['str', 'dex', 'wit', 'will'].map(id => ({id: `a-${id}`, kind: 'value', source: {kind: 'output', reference: out_(id, 'value', 'value.final')}, write: {operation: 'set'}}))},
    {id: 'state', kind: 'section', labelKey: 'Condition', columns: 1, children: [
      {id: 'hurt', kind: 'value', labelKey: 'Health', source: {kind: 'output', reference: out_('hp', 'pool', 'pool.current', 'points')}, write: {operation: 'subtract'}},
      {id: 'heal', kind: 'value', labelKey: 'Luck', source: {kind: 'output', reference: out_('luck', 'pool', 'pool.current', 'points')}, write: {operation: 'add'}},
      {id: 'def', kind: 'value', source: {kind: 'formula', formulaRef: 'defence'}}]},
    {id: 'note', kind: 'text', span: 2, textKey: 'Values in bold are computed by the Ruleset.'}]}]},
  {id: 'skills-tab', kind: 'tab', labelKey: 'Skills', children: [{id: 'skills', kind: 'repeater', query: {definitionTypeId: 'skill'}, columns: 3, children: [
    {id: 'rank', kind: 'value', source: {kind: 'each', capabilityId: 'value', outputId: 'value.final'}, write: {operation: 'set'}},
    {id: 'mark', kind: 'value', source: {kind: 'each', capabilityId: 'state', outputId: 'state.active'}, write: {operation: 'set'}},
    {id: 'roll', kind: 'action', actionRef: 'sneak', labelKey: 'Roll'}]}]}]}};

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

const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const page = (body, theme) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative;display:flex;flex-direction:column;height:var(--qa-height,auto)}.window-content{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden}</style><body class="${theme}"><div class="application sheet ${theme}" style="width:var(--qa-width)"><section class="window-content">${body}</section></div></body></html>`;
const sheets = [
  ['actor-auto', await projectSheet(engine, v, sheetFor(ruleset, {target: 'actor'}), {actor: hero, items: [{id: 'sword-1', name: 'Grandfather\'s sword', img: '', managed: true}, {id: 'rope', name: 'Rope (15 m)', img: '', managed: false}]}), 'Ayla the Brave'],
  ['actor-tabbed', await projectSheet(engine, v, tabbed, {actor: hero}), 'Ayla the Brave'],
  ['actor-styled', await projectSheet(engine, v, styled, {actor: hero, items: [{id: 'sword-1', name: 'Grandfather\'s sword', img: '', managed: true}]}), 'Ayla the Brave'],
  ['item-owned', await projectSheet(engine, v, sheetFor(ruleset, {target: 'item', contentTypeId: 'weapon'}), {actor: hero, content: {key: 'sword-1'}}), 'Sword']
];
const english = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
const t = key => key?.split('.').reduce((node, part) => node?.[part], english) ?? key;
const files = [];
for (const [name, view, title] of sheets) for (const theme of ['theme-dark', 'theme-light']) {
  const file = join(out, `sheet-${name}-${theme}.html`);
  writeFileSync(file, page(renderSheetHTML(view, {t, name: title, editable: true}), theme));
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
