// Visual QA of the part export and import dialogs: renders them from the RWF example Ruleset with the module CSS (and
// Foundry's, with RTA_FOUNDRY_CSS) in Foundry's dialog frame, and checks them in Chromium at a wide and a narrow width:
// no horizontal overflow, no clipped label, and the gaps between stacked blocks on the 4 / 8 / 12 px scale.
// Usage: RTA_CHROMIUM=<chrome> [RTA_FOUNDRY_CSS=<foundry.css>] [RTA_SHOTS=<dir>] node qa/part-dialogs-render.mjs <repo> <outDir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] ?? '.'), out = resolve(process.argv[3] ?? 'qa-out/parts');
mkdirSync(out, {recursive: true});
const load = path => import(pathToFileURL(join(root, path)).href);
const {collectDependencies, exportRulesetPart, planRulesetPartImport} = await load('src/configurator/ruleset-parts.mjs');
const {groupPartRefs, partImportView, PART_FAMILY_KEYS} = await load('src/configurator/ruleset-part-view.mjs');
const {renderPartExportContent, renderPartImportContent} = await load('src/ui/dialog-markup.mjs');
const {copyJSON} = await load('src/configurator/configurator-schema.mjs');

const ruleset = JSON.parse(readFileSync(join(root, 'Rulesets/rwf/rwf-ruleset-2.5.0.json'), 'utf8')).versionRecord.workingDraft;
const french = JSON.parse(readFileSync(join(root, 'lang/fr.json'), 'utf8'));
const t = (key, data = {}) => String(key?.split('.').reduce((node, part) => node?.[part], french) ?? key).replace(/\{(\w+)\}/g, (_, name) => data[name] ?? '');
const nameOf = (collection, id) => (ruleset[collection] ?? []).find(entry => entry.id === id)?.nameKey ?? id;
const sheet = {objectKind: 'sheetDefinition', objectId: ruleset.sheetDefinitions[0].id};
const {roots, dependencies} = collectDependencies(ruleset, [sheet]);
const groups = groupPartRefs(dependencies, nameOf).map(group => ({...group, title: t(PART_FAMILY_KEYS[group.collection])}));
const exportBody = renderPartExportContent(nameOf('sheetDefinitions', sheet.objectId), t('RTA.Part.ExportSummary', {count: roots.length, dependencies: dependencies.length}), groups,
  {name: t('RTA.Part.Name'), dependencies: t('RTA.Part.Dependencies'), hint: t('RTA.Part.DependenciesHint'), none: t('RTA.Part.NoDependencies'),
    extension: t('RTA.Extension.Section'), extensionHint: t('RTA.Extension.SectionHint'), asExtension: t('RTA.Extension.AsExtension'), version: t('RTA.Extension.Version'), minVersion: t('RTA.Extension.MinVersion')}, {version: '1.0.0', minVersion: ruleset.version});
// Import into a copy where some entries changed and one is gone: conflicts and new entries.
const part = exportRulesetPart(ruleset, {selection: [{objectKind: 'action', objectId: ruleset.actions.find(entry => entry.testRef).id}]});
const target = copyJSON(ruleset);
for (const [collection, list] of Object.entries(part.entries)) for (const [i, entry] of list.entries()) {
  const current = target[collection].find(x => x.id === entry.id);
  if (i % 3 === 0) current.nameKey += ' (modifié)';
  if (i % 3 === 1 && collection === 'effects') target[collection] = target[collection].filter(x => x.id !== entry.id);
}
const view = partImportView(planRulesetPartImport(target, part), (collection, row) => row.nameKey || row.id);
const titled = row => ({...row, title: t(PART_FAMILY_KEYS[row.collection])});
const importBody = renderPartImportContent(t('RTA.Part.ImportSummary', {source: 'RWF', ...view.counts}), view.conflicts.map(titled), view.added.map(titled),
  ['keep', 'replace', 'rename'].map(value => ({value, label: t(`RTA.Part.Choice.${value}`)})), {conflicts: t('RTA.Part.Conflicts'), hint: t('RTA.Part.ConflictsHint'), added: t('RTA.Part.Added'), removed: t('RTA.Extension.Removed')}, view.added.slice(0, 2).map(titled));

const foundryCss = process.env.RTA_FOUNDRY_CSS ? readFileSync(process.env.RTA_FOUNDRY_CSS, 'utf8') + '\n' : '';
const css = foundryCss + JSON.parse(readFileSync(join(root, 'module.json'), 'utf8')).styles.map(p => readFileSync(join(root, p), 'utf8')).join('\n');
const html = (body, theme) => `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${css}\nbody{margin:0;font-family:sans-serif;font-size:14px}.application{position:relative}</style><body class="${theme}"><div class="application dialog rta-part-dialog ${theme}" style="width:var(--qa-width)"><form class="window-content dialog-form standard-form"><div class="dialog-content standard-form">${body}</div><footer class="form-footer"><button type="submit">OK</button></footer></form></div></body></html>`;
const files = [];
for (const [name, body] of [['export', exportBody], ['import', importBody]]) for (const theme of ['theme-dark', 'theme-light']) {
  const file = join(out, `part-${name}-${theme}.html`); writeFileSync(file, html(body, theme)); files.push([`${name}-${theme}`, file]);
}

const browser = await chromium.launch({executablePath: process.env.RTA_CHROMIUM, args: ['--no-sandbox']});
const tab = await browser.newPage({viewport: {width: 700, height: 900}});
let problems = 0;
for (const [name, file] of files) for (const width of [640, 420]) {
  await tab.goto(pathToFileURL(file).href);
  await tab.evaluate(w => document.querySelector('.application').style.setProperty('--qa-width', `${w}px`), width);
  await tab.evaluate(() => {for (const details of document.querySelectorAll('details')) details.open = true; document.querySelector('.rta-part-group')?.removeAttribute('open'); const member = document.querySelector('[data-part-member="1"]'); if (member) member.checked = false; const box = document.querySelector('[data-part-group="1"]'); if (box) box.indeterminate = true;});
  const report = await tab.evaluate(() => {
    const issues = [], content = document.querySelector('.window-content'), allowed = [4, 8, 12];
    if (content.scrollWidth > content.clientWidth + 1) issues.push(`horizontal overflow ${content.scrollWidth} > ${content.clientWidth}`);
    for (const el of document.querySelectorAll('.rta-part-dialog :is(label, select, button, summary)')) if (el.scrollWidth > el.clientWidth + 1) issues.push(`clipped: ${el.textContent.trim().slice(0, 40)}`);
    for (const parent of document.querySelectorAll('.rta-part-dialog :is(.rta-part-groups, .rta-part-choice, .rta-part-conflicts, .rta-part-extension__body)')) {
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
  if (process.env.RTA_SHOTS) { mkdirSync(process.env.RTA_SHOTS, {recursive: true}); await tab.locator('.application').screenshot({path: join(process.env.RTA_SHOTS, `part-${name}-${width}.png`)}); }
}
await browser.close();
console.log(problems ? `part dialogs QA: ${problems} problem(s)` : 'part dialogs QA: no problem');
process.exitCode = problems ? 1 : 0;
