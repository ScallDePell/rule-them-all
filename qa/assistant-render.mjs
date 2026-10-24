// Renders the assistant window in a few states as static HTML (real Handlebars, real API, real CSS), then, in a
// browser, answers a path through the form itself and applies it: the controls must give back the answers they show.
// Prerequisites outside the repo: npm i --no-save handlebars playwright-core
// Usage: node qa/assistant-render.mjs <repoRoot> <outDir>   (RTA_CHROMIUM: Chromium path, default /usr/bin/chromium)
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import Handlebars from 'handlebars';
const [root, out] = process.argv.slice(2); mkdirSync(out, {recursive: true});
const lang = JSON.parse(readFileSync(join(root, 'lang/fr.json'), 'utf8'));
const lookup = key => key.split('.').reduce((o, k) => o?.[k], lang) ?? key;
class ApplicationV2 {async _prepareContext() { return {}; } render() {}}
globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: B => B, DialogV2: class {}}}};
globalThis.game = {i18n: {lang: 'fr', localize: lookup, format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? '')}, settings: {get() {}, set: async () => {}, register() {}}, user: {isGM: true}};
const imp = rel => import(pathToFileURL(join(root, rel)).href);
const {createConfiguratorAPI} = await imp('src/configurator/configurator-api.mjs');
const {emptyStorageSnapshot} = await imp('src/configurator/configurator-storage.mjs');
const {AssistantApp} = await imp('src/configurator/assistant-app.mjs');
class Storage {snapshot = emptyStorageSnapshot(); async load() { return structuredClone(this.snapshot); } async save(d) { this.snapshot = structuredClone(d); }}
const api = await createConfiguratorAPI(new Storage());
const v = (await api.createRuleset({id: 'qa', nameKey: 'Ruleset QA', version: '1.0.0'})).versionId;
const texts = Object.fromEntries(api.assistantTextKeys().map(key => [key, lookup(key)]));
await api.applyAssistant(v, 'characteristics', {items: [{name: 'Force'}, {name: 'Agilité'}]}, {texts});
await api.applyAssistant(v, 'resource', {name: 'Vitalité', maxValue: 12}, {texts});

Handlebars.registerHelper('localize', key => lookup(String(key)));
const tpl = Handlebars.compile(readFileSync(join(root, 'templates/configurator/assistant.hbs'), 'utf8'));
const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const selectUrl = pathToFileURL(join(root, 'src/ui/rta-select.mjs')).href;
const page = body => `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative;width:100%;max-width:none;box-sizing:border-box;height:820px;display:flex;flex-direction:column}</style><body class="theme-dark"><div id="rta-assistant" class="application theme-dark"><section class="window-content" style="display:flex;flex-direction:column;min-height:0;overflow:hidden;height:100%">${body}</section></div><script type="module">import('${selectUrl}').then(({RTASelect})=>RTASelect.enhance(document.body));</script></body></html>`;
const states = [
  ['intro', {}],
  ['attack', {pathId: 'attack', answers: {name: 'Coup d\'épée', damage: '1d8'}}],
  ['characteristics', {pathId: 'characteristics', answers: {items: [{name: 'Esprit'}, {name: 'Charisme'}], modifier: 'halfMinusTen'}}],
  ['state', {pathId: 'state', answers: {name: 'Empoisonné', duration: 'round', modifiers: [{target: {use: 'agilite'}, operation: 'subtract', amount: {type: 'literal', value: 2}}]}}],
  ['errors', {pathId: 'test', answers: {name: '', dice: '1d20+', target: 'fixed'}}]
];
for (const [name, options] of states) {
  const app = new AssistantApp({api, versionId: v, ...options});
  writeFileSync(join(out, `assistant-${name}.html`), page(tpl(await app._prepareContext({}))));
}
console.log('rendered', states.length);
