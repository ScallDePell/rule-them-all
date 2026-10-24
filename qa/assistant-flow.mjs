// Drives the assistant window in a browser like a GM would: choose a path, answer through the form's own controls
// (a sub-path created inline, a list row added, an optional Formula switched on), apply, and check what was written.
// Prerequisites outside the repo: npm i --no-save handlebars playwright-core
// Usage: RTA_CHROMIUM=<chrome> [RTA_SHOTS=<dir>] node qa/assistant-flow.mjs <repo>
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
const [root] = process.argv.slice(2);
const fr = JSON.parse(readFileSync(join(root, 'lang/fr.json'), 'utf8'));
const url = rel => pathToFileURL(join(root, rel)).href;
const css = JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const template = readFileSync(join(root, 'templates/configurator/assistant.hbs'), 'utf8');
const handlebars = createRequire(join(process.cwd(), 'index.js')).resolve('handlebars/dist/handlebars.min.js');
const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox', '--allow-file-access-from-files']});
const page = await browser.newPage({viewport: {width: 1080, height: 820}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(join(root, 'README.md')).href);
await page.setContent(`<!doctype html><html lang="fr"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{height:820px;display:flex;flex-direction:column}.window-content{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}</style><body class="theme-dark"><div class="application theme-dark"><section class="window-content"></section></div></body></html>`);
await page.addScriptTag({path: handlebars});
const result = await page.evaluate(async ({fr, urls, template}) => {
  const lookup = key => key.split('.').reduce((o, k) => o?.[k], fr) ?? key;
  const host = document.querySelector('.window-content'), tpl = Handlebars.compile(template);
  Handlebars.registerHelper('localize', key => lookup(String(key)));
  class ApplicationV2 {
    constructor(options) { this.options = options; }
    async _prepareContext() { return {}; }
    async _onRender() {}
    setPosition() {}
    async render() { const context = await this._prepareContext({}); host.innerHTML = tpl(context); this.element = host; await this._onRender(context, {}); this.rendered = true; return this; }
  }
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: B => B, DialogV2: class {}}}};
  globalThis.game = {i18n: {lang: 'fr', localize: lookup, format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? '')}, settings: {get() {}, set: async () => {}, register() {}}, user: {isGM: true}};
  globalThis.ui = {notifications: {info() {}, warn() {}, error() {}}};
  const {createConfiguratorAPI} = await import(urls.api);
  const {emptyStorageSnapshot} = await import(urls.storage);
  const {AssistantApp} = await import(urls.app);
  let snapshot = emptyStorageSnapshot();
  const api = await createConfiguratorAPI({load: async () => structuredClone(snapshot), save: async next => { snapshot = structuredClone(next); }});
  const v = (await api.createRuleset({id: 'qa', nameKey: 'QA', version: '1.0.0'})).versionId;
  let applied = 0;
  const app = new AssistantApp({api, versionId: v, onApplied: () => { applied++; }});
  await app.render(true);
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  const steps = [], check = (label, ok) => steps.push(`${ok ? 'ok' : 'FAIL'} ${label}`);
  const el = selector => host.querySelector(selector);
  const click = async selector => { const target = el(selector); if (!target) return steps.push(`FAIL nothing matches ${selector}`); target.click(); await wait(); };
  const set = async (selector, value) => {
    const field = el(selector); if (!field) return steps.push(`FAIL nothing matches ${selector}`);
    if (field.type === 'checkbox') field.checked = value; else field.value = value;
    field.dispatchEvent(new Event('input', {bubbles: true})); field.dispatchEvent(new Event('change', {bubbles: true})); await wait();
  };
  const ruleset = () => api.getRuleset(v);

  // A resource: two answers, then Apply.
  await click('[data-action="choosePath"][data-path-id="resource"]');
  check('choosing a path shows its questions', Boolean(el('[data-answer="name"]')));
  await set('[data-answer="name"]', 'Vitalité');
  await set('[data-answer="maxValue"]', '12');
  check('the preview lists what will be created', el('[data-assistant-preview]').textContent.includes('Vitalité'));
  check('Apply is enabled once every answer is given', !el('[data-action="apply"]').disabled);
  await click('[data-action="apply"]'); await wait(60);
  check('applying writes the resource', ruleset().definitions.some(d => d.id === 'vitalite' && d.slots.pool[0].maximum.literal === 12));
  check('the configurator is told', applied === 1);
  check('the result links to what was created', Boolean(el('[data-action="openEntry"][data-entry-id="vitalite"]')));

  // Characteristics: a list with an added row.
  await click('[data-action="choosePath"][data-path-id="characteristics"]');
  await set('[data-answer="items.0.name"]', 'Force');
  await click('[data-action="addRow"][data-list="items"]');
  check('adding a row shows its fields', Boolean(el('[data-answer="items.1.name"]')));
  await set('[data-answer="items.1.name"]', 'Agilité');
  await click('[data-action="apply"]'); await wait(60);
  check('both rows are written', ['force', 'agilite'].every(id => ruleset().definitions.some(d => d.id === id)));

  // An attack: its test created inline, an optional Formula switched on.
  await click('[data-action="choosePath"][data-path-id="attack"]');
  await set('[data-answer="name"]', 'Coup');
  check('the test starts as a new one, asked inline', Boolean(el('[data-answer="test.create.dice"]')));
  await set('[data-answer="test.create.dice"]', '1d20');
  await set('[data-answer="damage"]', '1d6');
  await set('[data-answer="damageTarget"]', 'use:vitalite');
  await set('[data-answer-toggle="damageBonus"]', true);
  check('switching an optional Formula on shows its builder', Boolean(el('[data-answer="damageBonus"] [data-expr-root]')));
  const literal = el('[data-answer="damageBonus"] [data-operand-part="value"]');
  if (literal) { literal.value = '2'; literal.dispatchEvent(new Event('change', {bubbles: true})); await wait(); }
  await set('[data-answer="test.create.targetFormula"] [data-operand-part="value"]', '10');
  check('no error is left', !el('[data-assistant-preview]').textContent.includes(lookup('RTA.Assistant.Word.Errors')));
  await click('[data-action="apply"]'); await wait(60);
  const action = ruleset().actions.find(a => a.id === 'coup');
  check('the attack is written with its new test', Boolean(action?.testRef && ruleset().tests.some(t => t.id === action.testRef)));
  const effect = ruleset().effects.find(e => action?.outcomeMappings?.[0]?.effectRefs?.includes(e.id));
  check('its damage bonus is the Formula typed', ruleset().formulas.some(f => f.id === effect?.operand?.bonusFormulaRef && f.expression.value === 2));

  // An Action input whose id Formulas read: the GM gives that id next to its name.
  await click('[data-action="choosePath"][data-path-id="action"]');
  await set('[data-answer="name"]', 'Viser');
  await click('[data-action="addRow"][data-list="inputs"]');
  check('an input row asks for its id too', Boolean(el('[data-answer="inputs.0.name"][data-answer-kind="nameId"]')));
  await set('[data-answer="inputs.0.name"][data-answer-kind="name"]', 'Bonus de visée');
  await set('[data-answer="inputs.0.name"][data-answer-kind="nameId"]', 'vise');
  await click('[data-action="apply"]'); await wait(60);
  check('the input keeps the id given', ruleset().actions.find(a => a.id === 'viser')?.inputs?.[0]?.id === 'vise');

  // A wrong answer is shown on its question, and nothing is written.
  await click('[data-action="choosePath"][data-path-id="test"]');
  const before = JSON.stringify(ruleset());
  await set('[data-answer="name"]', 'Perception');
  await set('[data-answer="dice"]', '1d20+');
  check('a wrong dice formula is shown on its question', !el('[data-answer-error="dice"]').hidden);
  check('Apply stays off', el('[data-action="apply"]').disabled);
  check('nothing was written', JSON.stringify(ruleset()) === before);
  return steps;
}, {fr, template, urls: {api: url('src/configurator/configurator-api.mjs'), storage: url('src/configurator/configurator-storage.mjs'), app: url('src/configurator/assistant-app.mjs')}});
if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, 'assistant-flow.png'), fullPage: false});
await browser.close();
for (const step of result) console.log(step);
for (const error of errors) console.error('page error:', error);
const failed = result.filter(step => step.startsWith('FAIL')).length + errors.length;
console.log(failed ? `assistant flow: ${failed} failure(s)` : 'assistant flow: all steps passed');
if (failed) process.exitCode = 1;
