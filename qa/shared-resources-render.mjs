// Visual QA of the shared resources panel: renders it for the GM and for a player with the module CSS (and Foundry's,
// with RTA_FOUNDRY_CSS) and checks it in Chromium at a wide and a narrow width: no horizontal overflow, no clipped
// label, and the gaps between stacked blocks on the 4 / 8 / 12 px scale.
// Usage: RTA_CHROMIUM=<chrome> [RTA_FOUNDRY_CSS=<foundry.css>] [RTA_SHOTS=<dir>] node qa/shared-resources-render.mjs <repo> <outDir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] ?? '.'), out = resolve(process.argv[3] ?? 'qa-out/shared');
mkdirSync(out, {recursive: true});
const load = path => import(pathToFileURL(join(root, path)).href);
const {createConfiguratorAPI} = await load('src/configurator/configurator-api.mjs');
const {emptyStorageSnapshot} = await load('src/configurator/configurator-storage.mjs');
const {MemoryRuntimeAdapter} = await load('src/runtime/memory-runtime-adapter.mjs');
const {createRuntimeAPI} = await load('src/runtime/runtime-api.mjs');
const {renderSharedResourcesHTML} = await load('src/ui/shared-resources-markup.mjs');

class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
const api = await createConfiguratorAPI(new Storage());
const v = (await api.createRuleset({id: 'qa', nameKey: 'QA', version: '1'})).versionId;
await api.registerDefinitionType(v, {id: 'track', key: 'track', nameKey: 'Track', allowedCapabilities: ['pool', 'value'], defaultCapabilities: ['pool'], requiredCapabilities: [], fields: {}});
const pool = (id, name, max) => ({id, key: id, definitionTypeId: 'track', nameKey: name, data: {}, capabilities: ['pool'], slots: {pool: [{id: 'points', minimum: {literal: 0}, maximum: {literal: max}, initial: {literal: 0}}]}});
await api.createDefinition(v, pool('fear', 'GM Fear', 12));
await api.createDefinition(v, pool('clock', 'Clock of the cult gathering its strength in the old quarter', 8));
await api.createDefinition(v, {id: 'doom', key: 'doom', definitionTypeId: 'track', nameKey: 'Doom', data: {}, capabilities: ['value']});
await api.createDefinition(v, pool('escalation', 'Escalation die', 6));
await api.updateRuleset(v, {sharedDefinitions: {world: ['fear', 'clock', 'doom'], combat: ['escalation']}});
await api.publishRuleset(v);
const adapter = new MemoryRuntimeAdapter(), runtime = createRuntimeAPI(api, {adapter, hooks: null}), fight = {kind: 'combat', id: 'c1'};
await runtime.initializeShared(v, {combat: fight});
await runtime.setSharedValue(v, {kind: 'world', id: 'world'}, 'fear', 'points', 4);
await runtime.setSharedValue(v, fight, 'escalation', 'points', 2);
const english = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
const t = key => key?.split('.').reduce((node, part) => node?.[part], english) ?? key;
const pages = [['gm', renderSharedResourcesHTML(await runtime.describeShared(v, {combat: fight}), {t})], ['gm-no-combat', renderSharedResourcesHTML(await runtime.describeShared(v), {t})]];
adapter.users.set('alice', {role: 'player', isGM: false}); adapter.ownership.set('world:world|alice', 'observer'); adapter.ownership.set('combat:c1|alice', 'observer'); adapter.currentUserId = 'alice';
pages.push(['player', renderSharedResourcesHTML(await runtime.describeShared(v, {combat: fight}), {t})]);

const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const html = (body, theme) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative}</style><body class="${theme}"><div class="application rta-shared-app ${theme}" style="width:var(--qa-width)"><section class="window-content">${body}</section></div></body></html>`;
const files = [];
for (const [name, body] of pages) for (const theme of ['theme-dark', 'theme-light']) { const file = join(out, `shared-${name}-${theme}.html`); writeFileSync(file, html(body, theme)); files.push([`${name}-${theme}`, file]); }

const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox']});
const tab = await browser.newPage({viewport: {width: 600, height: 600}});
let problems = 0;
for (const [name, file] of files) for (const width of [360, 280]) {
  await tab.goto(pathToFileURL(file).href);
  await tab.evaluate(w => document.querySelector('.application').style.setProperty('--qa-width', `${w}px`), width);
  const report = await tab.evaluate(() => {
    const issues = [], content = document.querySelector('.window-content'), allowed = [4, 8, 12];
    if (content.scrollWidth > content.clientWidth + 1) issues.push(`horizontal overflow ${content.scrollWidth} > ${content.clientWidth}`);
    for (const el of document.querySelectorAll('.rta-shared__row > :first-child, button')) if (el.scrollWidth > el.clientWidth + 1) issues.push(`clipped: ${el.textContent.trim()}`);
    for (const parent of document.querySelectorAll('.rta-shared, .rta-shared *')) {
      const style = getComputedStyle(parent);
      if (!['flex', 'grid'].includes(style.display)) continue;
      const kids = [...parent.children].filter(kid => getComputedStyle(kid).display !== 'none' && kid.getBoundingClientRect().height > 0);
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
        if (b.top < a.bottom - 1 || Math.abs(a.left - b.left) > 1) continue;
        const gap = Math.round(b.top - a.bottom);
        if (!allowed.includes(gap)) issues.push(`gap ${gap}px between ${kids[i - 1].className || kids[i - 1].tagName} and ${kids[i].className || kids[i].tagName}`);
      }
    }
    return issues;
  });
  if (report.length) { problems += report.length; console.log(`${name} @${width}: ${[...new Set(report)].join('; ')}`); }
  if (process.env.RTA_SHOTS) { mkdirSync(process.env.RTA_SHOTS, {recursive: true}); await tab.locator('.application').screenshot({path: join(process.env.RTA_SHOTS, `shared-${name}-${width}.png`)}); }
}
await browser.close();
console.log(problems ? `shared resources QA: ${problems} problem(s)` : 'shared resources QA: no problem');
process.exitCode = problems ? 1 : 0;
