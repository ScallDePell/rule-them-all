// Drives the sheet editor in a browser like a GM would: select blocks, add one, change its settings, move it,
// undo, generate the automatic layout, then save, and checks the saved SheetDefinition at each step.
// Usage: node qa/configurator-render.mjs <repo> <dir> && RTA_CHROMIUM=<chrome> [RTA_SHOTS=<dir>] node qa/sheet-editor-flow.mjs <repo> <dir>
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const [root, dir] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
const url = rel => pathToFileURL(join(root, rel)).href;
const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox', '--allow-file-access-from-files']});
const page = await browser.newPage({viewport: {width: 760, height: 1100}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(join(dir, 'editor-sheetDefinition.html')).href);
const result = await page.evaluate(async ({fixture, en, urls}) => {
  const lookup = key => key.split('.').reduce((o, k) => o?.[k], en) ?? key;
  class ApplicationV2 { constructor() {} async _prepareContext() { return {}; } async _onRender() {} render() {} close() {} setPosition() {} }
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: B => B, DialogV2: class {}}}};
  globalThis.game = {i18n: {lang: 'en', localize: lookup, format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? '')}, settings: {get() {}, set: async () => {}, register() {}}, user: {isGM: true}};
  globalThis.ui = {notifications: {warn: message => { throw new Error(message); }, error: message => { throw new Error(message); }, info() {}}};
  const {createConfiguratorAPI} = await import(urls.api);
  const {ConfiguratorEntryEditor} = await import(urls.editor);
  let snapshot = structuredClone(fixture.snapshot);
  const api = await createConfiguratorAPI({load: async () => structuredClone(snapshot), save: async next => { snapshot = structuredClone(next); }});
  const app = new ConfiguratorEntryEditor({api, versionId: fixture.versionId, kind: 'sheetDefinition', id: 'sh1'});
  await app._prepareContext({});
  const element = document.querySelector('.application');
  Object.defineProperty(app, 'element', {value: element});
  await app._onRender({}, {});
  const wait = () => new Promise(r => setTimeout(r, 30));
  const layout = () => JSON.parse(element.querySelector('[data-sheet-layout-value]').value);
  const find = (node, id) => node.id === id ? node : (node.children ?? []).map(c => find(c, id)).find(Boolean);
  const click = async selector => { const target = element.querySelector(selector); if (!target) { steps.push(`FAIL nothing matches ${selector}`); return; } target.click(); await wait(); };
  const set = async (selector, value) => { const field = element.querySelector(selector); if (!field) { steps.push(`FAIL nothing matches ${selector}`); return; } field.value = value; field.dispatchEvent(new Event('change', {bubbles: true})); await wait(); };
  const steps = [];
  const check = (label, ok) => steps.push(`${ok ? 'ok' : 'FAIL'} ${label}`);

  await click('[data-layout-canvas] [data-layout-node="derived"]');
  check('selecting a section shows its title', element.querySelector('[data-layout-properties] [data-layout-prop="labelKey"]')?.value === 'Derived');
  await set('[data-layout-properties] [data-layout-prop="columns"]', '2');
  check('changing its columns', find(layout(), 'derived').columns === 2);
  await set('[data-layout-toolbar] [data-layout-add]', 'value');
  const added = find(layout(), 'derived').children.at(-1);
  check('adding a value into the selection', added?.kind === 'value' && added.source?.kind === 'output');
  check('the new value is selected', element.querySelector('[data-layout-selected]')?.dataset.layoutNode === added.id);
  await set('[data-layout-properties] [data-layout-prop="sourceKind"]', 'formula');
  check('switching its source to a Formula', find(layout(), added.id).source.kind === 'formula');
  await set('[data-layout-properties] [data-layout-prop="span"]', '2');
  check('widening it to two columns', find(layout(), added.id).span === 2);
  await click('[data-layout-command="up"]');
  check('moving it up', find(layout(), 'derived').children.findIndex(c => c.id === added.id) === 1);
  await click('[data-layout-canvas] [data-layout-node="stat-value"]');
  check('a row value offers the listed Definition outputs', element.querySelector('[data-layout-properties] [data-layout-prop="sourceKind"]')?.value === 'each');
  await set('[data-layout-properties] [data-layout-prop="write"]', 'add');
  check('making it increasable', find(layout(), 'stat-value').write?.operation === 'add');
  await click('[data-layout-command="undo"]');
  check('undo', find(layout(), 'stat-value').write?.operation === 'set');
  // Drag the Strike button out of its section into the Stats section.
  const strike = element.querySelector('[data-layout-canvas] [data-layout-node="strike"]'), stats = element.querySelector('[data-layout-canvas] section[data-layout-node="stats"]');
  const data = new DataTransfer();
  strike.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: data}));
  stats.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: data}));
  stats.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: data})); await wait();
  check('dragging a block into another section', find(layout(), 'stats').children.some(c => c.id === 'strike'));
  await click('[data-layout-canvas] [data-layout-node="strike"]');
  await click('[data-layout-command="remove"]');
  check('removing a block', !find(layout(), 'strike'));
  await click('[data-sheet-tab="skills-tab"]');
  check('a tab shows its page when selected', !element.querySelector('[data-sheet-panel="skills-tab"]').hidden);
  await click('[data-layout-canvas] [data-layout-drop]');
  await set('[data-layout-toolbar] [data-layout-add]', 'value');
  check('an empty list gets a row value', find(layout(), 'skill-list').children[0]?.source?.kind === 'each');
  element.querySelector('[data-entry-form]').requestSubmit(); await new Promise(r => setTimeout(r, 200));
  const saved = api.getSheetDefinition(fixture.versionId, 'sh1');
  const canonical = value => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  check(`saving keeps the edited tree${canonical(saved.root) === canonical(layout()) ? '' : `: ${(await app._prepareContext({})).error || 'not saved'}`}`, canonical(saved.root) === canonical(layout()));
  await click('[data-layout-command="auto"]');
  check('automatic layout replaces the tree', layout().children.some(c => c.kind === 'section'));
  // Leave a value selected for the screenshot.
  await click('[data-layout-canvas] [data-layout-node^="each-"]');
  return steps;
}, {fixture, en, urls: {api: url('src/configurator/configurator-api.mjs'), editor: url('src/configurator/configurator-entry-editor.mjs')}});
if (process.env.RTA_SHOTS) {
  await page.addStyleTag({content: '.application,.window-content,.rta-config-entry,.rta-config-entry form,.rta-config-entry__scroll{height:auto!important;max-height:none!important;overflow:visible!important}'});
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-flow.png'), fullPage: true});
}
await browser.close();
for (const line of [...result, ...errors.map(e => `FAIL error: ${e}`)]) console.log(line);
const failed = result.filter(line => line.startsWith('FAIL')).length + errors.length;
console.log(failed ? `sheet editor: ${failed} failure(s)` : 'sheet editor: PASS');
process.exitCode = failed ? 1 : 0;
