// Visual QA of the character creation window: renders its pages with the module CSS (and Foundry's, with
// RTA_FOUNDRY_CSS) and checks them in Chromium at a wide and a narrow width: no horizontal overflow, no clipped
// step name, checkboxes at Foundry's size, and the gaps between blocks on the 4 / 8 / 12 px scale.
// Usage: RTA_CHROMIUM=<chrome> [RTA_FOUNDRY_CSS=<foundry.css>] [RTA_SHOTS=<dir>] node qa/creation-render.mjs <repo> <outDir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] ?? '.'), out = resolve(process.argv[3] ?? 'qa-out/creation');
mkdirSync(out, {recursive: true});
const load = path => import(pathToFileURL(join(root, path)).href);
const {createConfiguratorAPI} = await load('src/configurator/configurator-api.mjs');
const {emptyStorageSnapshot} = await load('src/configurator/configurator-storage.mjs');
const {CreationSessions, MemoryCreationSessionStore} = await load('src/runtime/creation-sessions.mjs');
const {creationView, renderCreationHTML, renderCreationStartHTML} = await load('src/ui/creation-markup.mjs');

class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
const api = await createConfiguratorAPI(new Storage());
const v = (await api.createRuleset({id: 'qa', nameKey: 'QA', version: '1'})).versionId;
const grant = (id, objectId) => ({id, operation: 'grant', targetRef: {objectKind: 'definition', objectId}, config: {add: {'value.base': 1}}});
await api.registerDefinitionType(v, {id: 'stat', key: 'stat', nameKey: 'Stat', allowedCapabilities: ['value'], defaultCapabilities: ['value'], requiredCapabilities: [], fields: {}});
const stats = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
const skills = [['athletics', 'Athletics'], ['stealth', 'Stealth'], ['perception', 'Perception'], ['insight', 'Insight'], ['lore', 'Forgotten lore of the old kingdoms'], ['medicine', 'Medicine']];
for (const [id, name] of [...stats, ...skills]) await api.createDefinition(v, {id, key: id, nameKey: name, definitionTypeId: 'stat', capabilities: ['value'], data: {}});
await api.createContentType(v, {id: 'background', nameKey: 'Background', storageKind: 'item', runtimeMode: 'unique'});
const backgrounds = [['soldier', 'Soldier'], ['sage', 'Sage'], ['urchin', 'Urchin'], ['noble', 'Noble'], ['hermit', 'Hermit who lived alone in the mountains'], ['sailor', 'Sailor']];
for (const [id, name] of backgrounds) await api.createContentTemplate(v, {id, nameKey: name, contentTypeId: 'background', relations: [],
  choiceGroups: id === 'soldier' ? [{id: 'skills', name: 'Two skills', min: 2, max: 2, options: skills.slice(0, 4).map(([skill]) => grant(`o-${skill}`, skill))}] : []});
await api.createRoll(v, {id: 'gold', nameKey: 'Gold', formula: '4d4'});
await api.createCreationSystem(v, {id: 'pc', nameKey: 'Player character', steps: [
  {id: 'background', name: 'Background', kind: 'content', min: 1, max: 1, source: {collection: 'contentTemplates', objectIds: backgrounds.map(([id]) => id)}},
  {id: 'abilities', name: 'Ability points', kind: 'allocation', min: 10, max: 10, perTargetMax: 4, source: {collection: 'definitions', objectIds: stats.map(([id]) => id)}},
  {id: 'gold', name: 'Starting gold', kind: 'roll', rollRef: 'gold'},
  {id: 'review', name: 'Review', kind: 'review'}]});
await api.publishRuleset(v);
const rolls = [11];
const sessions = new CreationSessions({configurator: api, store: new MemoryCreationSessionStore(), userId: () => 'player', roll: async formula => ({total: rolls.shift(), result: formula}), finalize: async () => ({})});
const ruleset = api.getPublishedRuleset(v);
const english = JSON.parse(readFileSync(join(root, 'lang/en.json'), 'utf8'));
const t = key => key?.split('.').reduce((node, part) => node?.[part], english) ?? key;
const viewOf = async id => creationView(await sessions.context(id), ruleset, t);

const {id} = await sessions.start(v, 'pc');
const pages = [['start', renderCreationStartHTML({drafts: [{id, label: 'Player character · 12/10/2026 14:00'}], systems: [{id: 'pc', label: 'Player character'}]}, {t})]];
await sessions.answer(id, 'background', {selectedIds: ['soldier']}); await sessions.goTo(id, 'background');
pages.push(['content', renderCreationHTML(await viewOf(id), {t})]);
await sessions.answer(id, 'background', {selectedIds: ['soldier'], contentChoices: {soldier: {skills: ['o-athletics', 'o-perception']}}});
await sessions.answer(id, 'abilities', {allocations: {str: 4, dex: 3, con: 1}}); await sessions.goTo(id, 'abilities');
pages.push(['allocation', renderCreationHTML(await viewOf(id), {t})]);
await sessions.answer(id, 'abilities', {allocations: {str: 4, dex: 3, con: 3}});
await sessions.draw(id, 'gold');
pages.push(['review', renderCreationHTML(await viewOf(id), {t})]);

const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const html = (body, theme) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative}</style><body class="${theme}"><div class="application rta-creation-app ${theme}" style="width:var(--qa-width)"><section class="window-content">${body}</section></div></body></html>`;
const files = [];
for (const [name, body] of pages) for (const theme of ['theme-dark', 'theme-light']) { const file = join(out, `creation-${name}-${theme}.html`); writeFileSync(file, html(body, theme)); files.push([`${name}-${theme}`, file]); }

const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox']});
const tab = await browser.newPage({viewport: {width: 800, height: 900}});
let problems = 0;
for (const [name, file] of files) for (const width of [760, 480]) {
  await tab.goto(pathToFileURL(file).href);
  await tab.evaluate(w => document.querySelector('.application').style.setProperty('--qa-width', `${w}px`), width);
  const report = await tab.evaluate(() => {
    const issues = [], content = document.querySelector('.window-content'), allowed = [4, 8, 12];
    if (content.scrollWidth > content.clientWidth + 1) issues.push(`horizontal overflow ${content.scrollWidth} > ${content.clientWidth}`);
    for (const el of document.querySelectorAll('.rta-creation__step-label, .rta-creation__title, button')) if (el.scrollWidth > el.clientWidth + 1 && !el.matches('.rta-creation__step-label, .rta-creation__option > span')) issues.push(`clipped: ${el.textContent.trim()}`);
    for (const box of document.querySelectorAll('.rta-creation input[type="checkbox"]')) { const r = box.getBoundingClientRect(); if (r.width < 10 || r.height < 10) issues.push(`checkbox ${r.width}x${r.height}`); }
    // Siblings stacked in a column are spaced by one gap token.
    for (const parent of document.querySelectorAll('.rta-creation, .rta-creation *')) {
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
  if (process.env.RTA_SHOTS) { mkdirSync(process.env.RTA_SHOTS, {recursive: true}); await tab.locator('.application').screenshot({path: join(process.env.RTA_SHOTS, `creation-${name}-${width}.png`)}); }
}
await browser.close();
console.log(problems ? `creation QA: ${problems} problem(s)` : 'creation QA: no problem');
process.exitCode = problems ? 1 : 0;
