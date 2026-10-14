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
const page = await browser.newPage({viewport: {width: 1180, height: 1100}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(join(dir, 'editor-sheetDefinition.html')).href);
// Sized like a Foundry window: the entry form scrolls inside it.
await page.addStyleTag({content: '.application{height:1000px;display:flex;flex-direction:column}.window-content{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}'});
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
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value"}\']');
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
  const tick = async key => { const box = element.querySelector(`[data-layout-properties] [data-layout-write="${key}"]`); if (!box) { steps.push(`FAIL no ${key} box`); return; } box.checked = !box.checked; box.dispatchEvent(new Event('change', {bubbles: true})); await wait(); };
  await tick('set');
  await tick('add');
  check('making it increasable', find(layout(), 'stat-value').write?.operation === 'add');
  await tick('subtract');
  check('raising and lowering together', find(layout(), 'stat-value').write?.operation === 'adjust' && element.querySelector('[data-layout-canvas] [data-layout-node="stat-value"]')?.querySelectorAll('[data-sheet-adjust]').length === 2);
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  const untick = async selector => { const box = element.querySelector(`[data-layout-properties] ${selector}`); if (!box) { steps.push(`FAIL nothing matches ${selector}`); return; } box.checked = !box.checked; box.dispatchEvent(new Event('change', {bubbles: true})); await wait(); };
  await untick('[data-layout-seen="observer"]');
  check('a block hidden from observers', JSON.stringify(find(layout(), 'stat-value').seenBy) === '["player","gm"]' && element.querySelector('[data-layout-canvas] [data-layout-node="stat-value"][data-layout-seen-by="player gm"]'));
  await untick('[data-layout-seen="player"]');
  await untick('[data-layout-seen="gm"]');
  check('a block is always for someone', JSON.stringify(find(layout(), 'stat-value').seenBy) === '["gm"]' && element.querySelector('[data-layout-properties] [data-layout-seen="gm"]').checked);
  await untick('[data-layout-write-by="gm"]');
  check('a value only the GM changes', find(layout(), 'stat-value').write?.by === 'gm');
  await set('[data-layout-toolbar] [data-layout-viewer]', 'player');
  check('the preview as the player leaves out a GM block', !element.querySelector('[data-layout-canvas] [data-layout-node="stat-value"]') && JSON.stringify(find(layout(), 'stat-value').seenBy) === '["gm"]');
  await set('[data-layout-toolbar] [data-layout-viewer]', 'all');
  check('every block again', Boolean(element.querySelector('[data-layout-canvas] [data-layout-node="stat-value"]')));
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  await set('[data-layout-properties] [data-layout-prop="display"]', 'description');
  check('a value in words', find(layout(), 'stat-value').display === 'description' && !find(layout(), 'stat-value').write
    && element.querySelector('[data-layout-canvas] [data-layout-node="stat-value"]')?.textContent.includes('Seems in great shape'));
  await click('[data-layout-command="undo"]');
  check('undo', find(layout(), 'stat-value').write?.operation === 'set');
  // Drag the Strike button out of its section into the Stats section.
  const strike = element.querySelector('[data-layout-canvas] [data-layout-node="strike"]'), stats = element.querySelector('[data-layout-canvas] section[data-layout-node="stats"]');
  const data = new DataTransfer();
  strike.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: data}));
  stats.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: data}));
  stats.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: data})); await wait();
  check('dragging a block into another section', find(layout(), 'stats').children.some(c => c.id === 'strike'));
  // Drag an Action from the palette onto the Stats section, then drop it on the top half of the section's first block.
  const drag = (source, target, {top = false} = {}) => { const box = target.getBoundingClientRect(), data = new DataTransfer(), at = {bubbles: true, cancelable: true, dataTransfer: data, clientX: box.left + 4, clientY: top ? box.top + 2 : box.top + box.height / 2};
    source.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: data})); target.dispatchEvent(new DragEvent('dragover', at)); target.dispatchEvent(new DragEvent('drop', at)); return wait(); };
  const before = find(layout(), 'stats').children.length;
  await drag(element.querySelector('[data-layout-palette-host] [data-layout-palette=\'{"kind":"action"}\']'), element.querySelector('[data-layout-canvas] section[data-layout-node="stats"]'));
  const dropped = find(layout(), 'stats').children.at(-1);
  check('dragging an Action from the palette onto a section', find(layout(), 'stats').children.length === before + 1 && dropped.kind === 'action');
  const first = find(layout(), 'stats').children[0];
  await drag(element.querySelector(`[data-layout-canvas] [data-layout-node="${dropped.id}"]`), element.querySelector(`[data-layout-canvas] [data-layout-node="${first.id}"]`), {top: true});
  check('dropping on the top edge of a block puts it before', find(layout(), 'stats').children[0]?.id === dropped.id);
  const strikeNow = element.querySelector('[data-layout-canvas] [data-layout-node="strike"]'), list = element.querySelector(`[data-layout-canvas] [data-layout-node="${find(layout(), 'stats').children.find(c => c.kind === 'repeater')?.id}"]`);
  if (list) { await drag(strikeNow, list, {top: true}); const kids = find(layout(), 'stats').children.map(c => c.id); check('the top edge of a list puts a block before the list, not in it', kids.indexOf('strike') === kids.indexOf(list.dataset.layoutNode) - 1); }
  const side = element.querySelector('.rta-sheet-editor__side');
  check('the tools sit beside the sheet and stay in view', getComputedStyle(side).position === 'sticky' && side.getBoundingClientRect().right <= element.querySelector('[data-layout-canvas]').getBoundingClientRect().left);
  await click('[data-layout-canvas] [data-layout-node="strike"]');
  await click('[data-layout-command="remove"]');
  check('removing a block', !find(layout(), 'strike'));
  await click('[data-sheet-tab="skills-tab"]');
  check('a tab shows its page when selected', !element.querySelector('[data-sheet-panel="skills-tab"]').hidden);
  await click('[data-layout-canvas] [data-layout-drop]');
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value"}\']');
  check('an empty list gets a row value', find(layout(), 'skill-list').children[0]?.source?.kind === 'each');
  // Tabs: two pages to start with; a click on the second shows it; another tab can be added; an empty page takes a drop.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"tabs"}\']');
  const tabs = find(layout(), 'derived').children.at(-1);
  check('new tabs come with two pages', tabs?.kind === 'tabs' && tabs.children.length === 2);
  await click(`[data-layout-canvas] [data-sheet-tab="${tabs.children[1].id}"]`);
  check('clicking the second tab shows its page', !element.querySelector(`[data-sheet-panel="${tabs.children[1].id}"]`).hidden && element.querySelector(`[data-sheet-panel="${tabs.children[0].id}"]`).hidden);
  await click('[data-layout-command="addTab"]');
  check('adding a tab', find(layout(), tabs.id).children.length === 3);
  const empty = element.querySelector(`[data-sheet-panel="${tabs.children[0].id}"] [data-layout-drop]`);
  await drag(element.querySelector('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value","display":"dots"}\']'), empty, {top: true});
  check(`dropping into the empty frame of a tab${empty ? '' : ' (no frame)'}${element.querySelector('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value","display":"dots"}\']') ? '' : ' (no palette item)'}`, find(layout(), tabs.children[0].id).children[0]?.display === 'dots');
  if (!find(layout(), tabs.children[0].id).children[0]) return steps;
  // Firefox aims drag events at the text inside the frame (a text node): the drop still lands.
  const frame = element.querySelector(`[data-sheet-panel="${tabs.children[1].id}"] [data-layout-drop]`), words = frame?.firstChild;
  if (words) { const data = new DataTransfer(), box = frame.getBoundingClientRect(), at = {bubbles: true, cancelable: true, dataTransfer: data, clientX: box.left + 4, clientY: box.top + box.height / 2};
    element.querySelector('[data-layout-palette-host] [data-layout-palette=\'{"kind":"text"}\']').dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: data}));
    words.dispatchEvent(new DragEvent('dragover', at)); words.dispatchEvent(new DragEvent('drop', at)); await wait(); }
  check('dropping on the words of an empty frame (Firefox)', find(layout(), tabs.children[1].id).children[0]?.kind === 'text');
  await click(`[data-layout-canvas] [data-layout-node="${find(layout(), tabs.children[0].id).children[0].id}"]`);
  await set('[data-layout-properties] [data-layout-prop="labelPlace"]', 'top');
  check('placing a label above its value', find(layout(), tabs.children[0].id).children[0].style?.label === 'top');
  await set('[data-layout-properties] [data-layout-prop="display"]', 'gauge');
  check('showing a value as a gauge', find(layout(), tabs.children[0].id).children[0].display === 'gauge' && element.querySelector('[data-layout-canvas] .rta-sheet-gauge'));
  const tone = sel => [...(element.querySelector(sel)?.options ?? [])].map(option => option.value).find(value => !['default', 'custom', 'none'].includes(value));
  await set('[data-layout-properties] [data-layout-style="fill"]', tone('[data-layout-properties] [data-layout-style="fill"]'));
  await set('[data-layout-properties] [data-layout-style="fillTo"]', tone('[data-layout-properties] [data-layout-style="fillTo"]'));
  { const gauge = find(layout(), tabs.children[0].id).children[0];
    check('a gauge in a two-color gradient', gauge.style?.fill && gauge.style?.fillTo && element.querySelector(`[data-layout-canvas] [data-layout-node="${gauge.id}"]`)?.getAttribute('style')?.includes('linear-gradient')); }
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  await click('[data-layout-command="undo"]');
  // A Definition family adds the list of its Definitions.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  const familyCount = find(layout(), 'derived').children.length;
  await click('[data-layout-palette-host] [data-layout-palette*="definitionTypeId"]');
  check('clicking a family adds its list', find(layout(), 'derived').children.length === familyCount + 1 && find(layout(), 'derived').children.at(-1).kind === 'repeater');
  await click('[data-layout-command="undo"]');
  // Style: colors, opacity, font, emphasis, spacing, then an image block.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  check('the Style group is offered, folded', element.querySelector('[data-layout-style-group]') && !element.querySelector('[data-layout-style-group]').open);
  await set('[data-layout-properties] [data-layout-style="background"]', 'accent');
  check('a background tone', find(layout(), 'derived').style?.background === 'accent');
  check('the Style group stays open while in use', element.querySelector('[data-layout-style-group]')?.open === true);
  await set('[data-layout-properties] [data-layout-style="background"]', 'custom');
  check('an own color starts from the tone shown', /^#[0-9a-f]{6}$/.test(find(layout(), 'derived').style?.background ?? ''));
  await set('[data-layout-properties] [data-layout-style-hex="background"]', '#224466');
  check('picking an own color', find(layout(), 'derived').style.background === '#224466');
  await set('[data-layout-properties] [data-layout-style="opacity"]', '60');
  await set('[data-layout-properties] [data-layout-style="font"]', 'Amiri');
  const bold = element.querySelector('[data-layout-properties] [data-layout-style="bold"]'); bold.checked = true; bold.dispatchEvent(new Event('change', {bubbles: true})); await wait();
  await set('[data-layout-properties] [data-layout-style="gap"]', 'tight');
  check('opacity, font, bold and spacing', JSON.stringify(find(layout(), 'derived').style) === JSON.stringify({background: '#224466', opacity: 60, font: 'Amiri', bold: true, gap: 'tight'}));
  const shown = element.querySelector('[data-layout-canvas] section[data-layout-node="derived"]');
  check('the canvas shows the style', /color-mix\(in srgb, #224466 60%, transparent\)/.test(shown?.getAttribute('style') ?? '') && /Amiri/.test(shown?.getAttribute('style') ?? '') && /gap: var\(--rta-gap-tight\)/.test(shown?.querySelector('.rta-sheet-grid')?.getAttribute('style') ?? ''));
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"image"}\']');
  const image = find(layout(), 'derived').children.at(-1);
  check('adding an image block', image?.kind === 'image' && image.src === '');
  await set('[data-layout-properties] [data-layout-prop="src"]', 'icons/svg/d20.svg');
  await set('[data-layout-properties] [data-layout-prop="height"]', 'small');
  check('choosing its picture and height', find(layout(), image.id).src === 'icons/svg/d20.svg' && find(layout(), image.id).height === 'small');
  await set('[data-layout-properties] [data-layout-prop="shape"]', 'portrait');
  check('a portrait picture', find(layout(), image.id).shape === 'portrait' && element.querySelector('[data-layout-canvas] .rta-sheet-image--portrait'));
  await set('[data-layout-properties] [data-layout-prop="shape"]', 'circle');
  check('a round picture', find(layout(), image.id).shape === 'circle' && element.querySelector('[data-layout-canvas] .rta-sheet-image--circle'));
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await click('[data-layout-command="unstyle"]');
  check('back to the default style', !find(layout(), 'derived').style);
  await click('[data-layout-command="undo"]');
  check('undo brings the style back', find(layout(), 'derived').style?.font === 'Amiri');
  // A background picture tiled from the top; a foldable section.
  await set('[data-layout-properties] [data-layout-style="image"]', 'icons/svg/d20.svg');
  await set('[data-layout-properties] [data-layout-style="imageFit"]', 'tile');
  await set('[data-layout-properties] [data-layout-style="imagePosition"]', 'top');
  check('a tiled background picture at the top', find(layout(), 'derived').style?.imageFit === 'tile' && /background-repeat: repeat; background-position: top/.test(element.querySelector('[data-layout-canvas] section[data-layout-node="derived"]')?.getAttribute('style') ?? ''));
  const fold = element.querySelector('[data-layout-properties] [data-layout-prop="collapsible"]'); fold.checked = true; fold.dispatchEvent(new Event('change', {bubbles: true})); await wait();
  check('a foldable section', find(layout(), 'derived').collapsible === true && element.querySelector('[data-layout-canvas] section[data-layout-node="derived"] .rta-sheet-section__toggle'));
  // A text with a value in it, a click Action, a Condition, a tooltip, a fixed width.
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"text"}\']');
  const line = find(layout(), 'derived').children.at(-1);
  await set('[data-layout-properties] [data-layout-prop="textKey"]', 'Total:');
  const insert = element.querySelector('[data-layout-properties] [data-layout-prop="insertValue"]');
  await set('[data-layout-properties] [data-layout-prop="insertValue"]', [...(insert?.options ?? [])].find(option => option.value && option.value !== ':none')?.value ?? '');
  { const text = find(layout(), line.id); check(`a value in a text: ${text.textKey}`, /^Total: \{[^}]+\}$/.test(text.textKey) && Object.keys(text.values ?? {}).length === 1 && element.querySelector(`[data-layout-canvas] [data-layout-node="${line.id}"] .rta-sheet-text__value`)); }
  await set('[data-layout-properties] [data-layout-prop="textKey"]', 'No value');
  check('a text keeps only the values it names', !find(layout(), line.id).values);
  await click('[data-layout-command="undo"]');
  await set('[data-layout-properties] [data-layout-prop="clickActionRef"]', 'a1');
  await set('[data-layout-properties] [data-layout-prop="visibleIf"]', 'c1');
  check('a click Action and a Condition', find(layout(), line.id).clickActionRef === 'a1' && element.querySelector(`[data-layout-canvas] [data-layout-node="${line.id}"][data-layout-conditional]`));
  await set('[data-layout-properties] [data-layout-prop="tooltip"]', 'What it costs');
  await set('[data-layout-properties] [data-layout-prop="width"]', 'medium');
  check('a tooltip and a fixed width', find(layout(), line.id).tooltip?.text === 'What it costs' && find(layout(), line.id).width === 'medium' && element.querySelector('[data-layout-more-group]')?.open !== undefined);
  // A text area kept on the Actor, a separator with an ornament, a clock and a track of boxes.
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"notes"}\']');
  const notes = find(layout(), 'derived').children.at(-1);
  await set('[data-layout-properties] [data-layout-prop="format"]', 'rich');
  check('a rich text area', notes.kind === 'notes' && find(layout(), notes.id).format === 'rich' && element.querySelector('[data-layout-canvas] .rta-sheet-notes__text--sample'));
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"separator"}\']');
  const separator = find(layout(), 'derived').children.at(-1);
  await set('[data-layout-properties] [data-layout-prop="look"]', 'ornament');
  check('an ornament separator', find(layout(), separator.id).look === 'ornament' && element.querySelector('[data-layout-canvas] .rta-sheet-separator--ornament'));
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value","display":"clock"}\']');
  check('a clock', find(layout(), 'derived').children.at(-1).display === 'clock' && element.querySelectorAll('[data-layout-canvas] .rta-sheet-clock path').length === 4);
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"value","display":"boxes"}\']');
  check('a track of boxes', find(layout(), 'derived').children.at(-1).display === 'boxes' && element.querySelector('[data-layout-canvas] .rta-sheet-dots--boxes'));
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
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-flow.png')});
  // Scrolled down: the tools stay beside the sheet; then the bottom of the tools column, with the palette.
  await page.evaluate(() => { const scroll = document.querySelector('.rta-config-entry__scroll'); scroll.scrollTop = scroll.scrollHeight; });
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-scrolled.png')});
  await page.evaluate(() => { const side = document.querySelector('.rta-sheet-editor__side'); side.scrollTop = side.scrollHeight; });
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-palette.png')});
  // A value shown as a gradient gauge, hidden from observers, raised and lowered by the GM only.
  await page.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 60)), fire = (field, value) => { if (typeof value === 'boolean') field.checked = value; else field.value = value; field.dispatchEvent(new Event('change', {bubbles: true})); };
    const props = () => document.querySelector('[data-layout-properties]');
    fire(props().querySelector('[data-layout-prop="display"]'), 'gauge'); await wait();
    for (const [prop, value] of [['fill', 'danger'], ['fillTo', 'warning']]) { fire(props().querySelector(`[data-layout-style="${prop}"]`), value); await wait(); }
    for (const key of ['set', 'add', 'subtract']) { const box = props().querySelector(`[data-layout-write="${key}"]`); if (box) { fire(box, key !== 'set'); await wait(); } }
    fire(props().querySelector('[data-layout-seen="observer"]'), false); await wait();
    fire(props().querySelector('[data-layout-write-by="gm"]'), true); await wait();
    document.querySelector('.rta-sheet-editor__side').scrollTop = 0; document.querySelector('.rta-config-entry__scroll').scrollTop = 0;
  });
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-gauge.png')});
  // The section with a text that shows a value, a rich text area, a separator, a clock and boxes; the text's settings.
  await page.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 60));
    while (!document.querySelector('[data-layout-canvas] section[data-layout-node="derived"] .rta-sheet-notes') && !document.querySelector('[data-layout-command="undo"]').disabled) { document.querySelector('[data-layout-command="undo"]').click(); await wait(); }
    document.querySelector('[data-layout-canvas] section[data-layout-node="derived"] .rta-sheet-text')?.click(); await wait();
    const more = document.querySelector('[data-layout-more-group]'); if (more) more.open = true;
    document.querySelector('[data-layout-canvas] section[data-layout-node="derived"]')?.scrollIntoView();
    document.querySelector('.rta-sheet-editor__side').scrollTop = 0;
  });
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-blocks.png')});
}
await browser.close();
for (const line of [...result, ...errors.map(e => `FAIL error: ${e}`)]) console.log(line);
const failed = result.filter(line => line.startsWith('FAIL')).length + errors.length;
console.log(failed ? `sheet editor: ${failed} failure(s)` : 'sheet editor: PASS');
process.exitCode = failed ? 1 : 0;
