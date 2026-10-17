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
// The sheet editor's own window width (1320): the three zones side by side.
const page = await browser.newPage({viewport: {width: 1320, height: 1100}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(join(dir, 'editor-sheetDefinition.html')).href);
// Sized like a Foundry window: the entry form scrolls inside it, its buttons stay at the bottom.
await page.addStyleTag({content: '.application{height:1000px;display:flex;flex-direction:column}.window-content{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}'});
const result = await page.evaluate(async ({fixture, en, urls}) => {
  const lookup = key => key.split('.').reduce((o, k) => o?.[k], en) ?? key;
  class ApplicationV2 { constructor() {} async _prepareContext() { return {}; } async _onRender() {} render() {} close() {} setPosition() {} }
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: B => B, DialogV2: class { static async prompt() { return globalThis.__answer ?? ''; } static async confirm() { return true; } }}}};
  globalThis.game = {i18n: {lang: 'en', localize: lookup, format: (k, d) => lookup(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? '')}, settings: {get() {}, set: async () => {}, register() {}}, user: {isGM: true}};
  globalThis.ui = {notifications: {warn: message => { throw new Error(message); }, error: message => { throw new Error(message); }, info() {}}};
  const {createConfiguratorAPI} = await import(urls.api);
  const {ConfiguratorEntryEditor} = await import(urls.editor);
  let snapshot = structuredClone(fixture.snapshot);
  const api = await createConfiguratorAPI({load: async () => structuredClone(snapshot), save: async next => { snapshot = structuredClone(next); }});
  // Gear with fields, and a card template made of them (an Item's: offered for cards, not in this Actor sheet's palette).
  const field = (id, name, valueType) => ({id, name, valueType, cardinality: 'one', nullable: false, required: false, constraints: []});
  await api.updateContentType(fixture.versionId, 'gear', {fields: {weight: field('weight', 'Weight', 'number'), price: field('price', 'Price', 'number')}});
  await api.createSheetTemplate(fixture.versionId, {id: 'gear-card', nameKey: 'Gear card', root: {id: 'card', kind: 'section', columns: 2, children: [{id: 'card-picture', kind: 'portrait'}, {id: 'card-name', kind: 'name'}, {id: 'card-weight', kind: 'value', source: {kind: 'field', fieldId: 'weight'}}]}});
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
  // Three zones side by side, each the window's full height and scrolled on its own; the buttons stay below them.
  { const side = element.querySelector('.rta-sheet-editor__side'), main = element.querySelector('.rta-sheet-editor__main'), layers = element.querySelector('.rta-sheet-editor__layers-column');
    const footer = element.querySelector('.rta-config-entry__footer'), box = e => e.getBoundingClientRect(), zones = [side, main, layers];
    check('the tools, the sheet and the Layers sit side by side', box(side).right <= box(main).left + 1 && box(main).right <= box(layers).left + 1 && main.contains(element.querySelector('[name="nameKey"]')) && main.contains(element.querySelector('[data-layout-canvas]')) && layers.contains(element.querySelector('[data-layout-layers]')));
    check('the three zones take the full height', zones.every(z => Math.abs(box(z).top - box(side).top) < 1 && Math.abs(box(z).bottom - box(side).bottom) < 1) && box(side).bottom <= box(footer).top + 1);
    // Long enough to scroll: a long sheet (a tall block under it), every group of the block's settings open.
    const tall = Object.assign(document.createElement('div'), {style: 'height: 1200px'}); element.querySelector('.rta-sheet-editor__stage').append(tall);
    for (const group of element.querySelectorAll('[data-layout-properties] details')) group.open = true;
    check(`the tools and the sheet scroll (${[side, main].map(z => `${z.scrollHeight}/${z.clientHeight}`).join(', ')})`, [side, main].every(z => getComputedStyle(z).overflowY === 'auto' && z.scrollHeight > z.clientHeight) && getComputedStyle(layers).overflowY === 'auto');
    main.scrollTop = main.scrollHeight;
    check('scrolling the sheet leaves the tools and the Layers in place', main.scrollTop > 0 && side.scrollTop === 0 && layers.scrollTop === 0);
    side.scrollTop = side.scrollHeight;
    check('scrolling the tools leaves the sheet in place', side.scrollTop > 0 && main.scrollTop > 0 && Math.abs(main.scrollTop - (main.scrollHeight - main.clientHeight)) < 2);
    side.scrollTop = 0;
    // The bar above the sheet (toolbar, "View as", preview width) stays in view while the sheet scrolls.
    const bar = element.querySelector('.rta-sheet-editor__stage-bar').getBoundingClientRect();
    check(`the toolbar stays above the scrolled sheet (${Math.round(bar.top)} vs ${Math.round(box(main).top)}, scrolled ${main.scrollTop})`, main.scrollTop > 0 && Math.abs(bar.top - box(main).top) < 2);
    tall.remove();
    const app = element.getBoundingClientRect();
    check('the window buttons stay in view', box(footer).height > 0 && box(footer).bottom <= app.bottom + 1 && box(footer).top >= box(main).bottom - 1);
    side.scrollTop = 0; main.scrollTop = 0; }
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
  check('a tooltip and a fixed width', find(layout(), line.id).tooltip?.text === 'What it costs' && find(layout(), line.id).width === 'medium' && element.querySelector('[data-layout-group="display"] [data-layout-prop="width"]'));
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
  // The header: standard (shown as a sample above the canvas) or none, with the name, portrait and token image placed as blocks.
  check('the standard header is previewed', Boolean(element.querySelector('[data-layout-canvas] .rta-sheet__header')));
  const headerField = element.querySelector('[name="sheetHeader"]');
  headerField.value = 'none'; headerField.dispatchEvent(new Event('change', {bubbles: true})); await wait();
  check('no header: none previewed', !element.querySelector('[data-layout-canvas] .rta-sheet__header'));
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  for (const kind of ['name', 'portrait', 'token']) await click(`[data-layout-palette-host] [data-layout-palette='{"kind":"${kind}"}']`);
  const placed = find(layout(), 'derived').children.slice(-3);
  check('adding the name, portrait and token blocks', JSON.stringify(placed.map(c => c.kind)) === '["name","portrait","token"]' && element.querySelector('[data-layout-canvas] .rta-sheet-name') && element.querySelectorAll('[data-layout-canvas] .rta-sheet-picture').length === 2);
  await untick('[data-layout-prop="updatePlaced"]');
  check('the token image also updates the placed tokens', find(layout(), placed[2].id).updatePlaced === true);
  await click(`[data-layout-canvas] [data-layout-node="${placed[1].id}"]`);
  await set('[data-layout-properties] [data-layout-prop="shape"]', 'circle');
  check('a round portrait', find(layout(), placed[1].id).shape === 'circle' && element.querySelector(`[data-layout-canvas] [data-layout-node="${placed[1].id}"].rta-sheet-image--circle`));
  check('the editor never changes the Document', !element.querySelector('[data-layout-canvas] [data-sheet-edit-image], [data-layout-canvas] [data-sheet-name]'));
  element.querySelector('[data-entry-form]').requestSubmit(); await new Promise(r => setTimeout(r, 200));
  const saved = api.getSheetDefinition(fixture.versionId, 'sh1');
  check('saving keeps the header choice', saved.header === 'none');
  const canonical = value => JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  check(`saving keeps the edited tree${canonical(saved.root) === canonical(layout()) ? '' : `: ${(await app._prepareContext({})).error || 'not saved'}`}`, canonical(saved.root) === canonical(layout()));
  check('no automatic layout any more', !element.querySelector('[data-layout-command="auto"]'));
  // The toolbar, above the sheet: its nine buttons in five groups on one row, "View as" beside them.
  { const buttons = [...element.querySelectorAll('[data-layout-toolbar] [data-layout-command]')].map(b => b.getBoundingClientRect()), viewAs = element.querySelector('.rta-sheet-editor__view-as').getBoundingClientRect();
    check('the toolbar buttons sit on one row in five groups, "View as" beside them', buttons.length === 9 && element.querySelectorAll('[data-layout-toolbar] .rta-sheet-editor__tool-group').length === 5 && buttons.every(b => Math.abs(b.top - buttons[0].top) < 1) && viewAs.left >= buttons.at(-1).right && element.querySelector('.rta-sheet-editor__main').contains(element.querySelector('[data-layout-toolbar]')));
    // Each one drawn, a frame even when disabled, none narrower than a usable button.
    const frames = [...element.querySelectorAll('[data-layout-toolbar] [data-layout-command]')].map(b => getComputedStyle(b));
    check(`every toolbar button shows its frame (${buttons.map(b => Math.round(b.width)).join(',')} px)`, buttons.every(b => b.width >= 28) && frames.every(f => f.borderTopStyle !== 'none' && f.visibility !== 'hidden' && Number(f.opacity) > 0.3)); }
  const key = async (name, options = {}) => { (document.activeElement && element.contains(document.activeElement) ? document.activeElement : element.querySelector('[data-layout-canvas]')).dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...options})); await wait(); };
  const top = () => find(layout(), 'top').children;
  // Copy and paste: a section pasted while a section is selected goes into it, with new ids and its style.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  check('after a click the keyboard is on the sheet', document.activeElement === element.querySelector('[data-layout-canvas]'));
  await click('[data-layout-command="copy"]');
  check('copying a block allows pasting', element.querySelector('[data-layout-command="paste"]')?.disabled === false);
  await click('[data-layout-command="paste"]');
  { const pasted = find(layout(), 'derived').children.at(-1), source = find(layout(), 'derived');
    check('pasting a section into the selected section, with new ids, its children and its style', pasted?.kind === 'section' && pasted.id !== 'derived' && pasted.children.length === source.children.length - 1 && pasted.children.every(c => !['total', 'strike'].includes(c.id)) && JSON.stringify(pasted.style) === JSON.stringify(source.style)); }
  await key('z', {ctrlKey: true});
  check('Ctrl+Z undoes the paste', find(layout(), 'derived').children.every(c => c.kind !== 'section'));
  await key('y', {ctrlKey: true});
  check('Ctrl+Y redoes it', find(layout(), 'derived').children.at(-1)?.kind === 'section');
  await key('z', {ctrlKey: true, shiftKey: false});
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await key('d', {ctrlKey: true});
  const copy = top().at(-1);
  check('Ctrl+D duplicates the section right after it', top().length === 3 && top()[1].id === 'derived' && copy.kind === 'section' && copy.labelKey === 'Derived' && element.querySelector('[data-layout-selected]')?.dataset.layoutNode === copy.id);
  await key('ArrowUp');
  check('the up arrow moves the block up', top()[1].id === copy.id && top()[2].id === 'derived');
  await key('Delete');
  check('Delete removes it', !find(layout(), copy.id) && top().length === 2);
  await key('z', {ctrlKey: true, shiftKey: true});
  check('Ctrl+Shift+Z redoes too', !find(layout(), copy.id));
  { const field = element.querySelector('[data-layout-palette-filter]'); field.focus(); const count = JSON.stringify(layout()); field.dispatchEvent(new KeyboardEvent('keydown', {key: 'Delete', bubbles: true, cancelable: true})); await wait();
    check('keys typed in a field are left alone', JSON.stringify(layout()) === count); }
  // The sheet's settings share the middle zone with the sheet: Delete on one of their buttons removes no block.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  { const button = element.querySelector('[data-sheet-file="export"]'); button.focus(); const count = JSON.stringify(layout()); const sent = new KeyboardEvent('keydown', {key: 'Delete', bubbles: true, cancelable: true}); button.dispatchEvent(sent); await wait();
    check('keys on the sheet\'s settings are left alone', JSON.stringify(layout()) === count && !sent.defaultPrevented); }
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await key('Escape');
  check('Escape leaves nothing selected', !element.querySelector('[data-layout-selected]') && element.querySelector('[data-layout-command="remove"]').disabled && !element.querySelector('[data-layout-properties] [data-layout-prop]'));
  // A block from another Ruleset whose elements this one lacks is refused, with a message.
  const {copyToClipboard} = await import(urls.clipboard), warnings = [], warn = ui.notifications.warn;
  ui.notifications.warn = message => warnings.push(message);
  copyToClipboard({id: 'x', kind: 'value', source: {kind: 'formula', formulaRef: 'elsewhere'}});
  const unchanged = JSON.stringify(layout());
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await click('[data-layout-command="paste"]');
  ui.notifications.warn = warn;
  check(`pasting what the Ruleset lacks is refused${warnings[0] ? `: ${warnings[0]}` : ''}`, JSON.stringify(layout()) === unchanged && /elsewhere/.test(warnings[0] ?? ''));
  // The style brush: the section's style onto a value (what a value cannot take is left out); Escape puts it down.
  await click('[data-layout-command="brush"]');
  check('the brush is loaded', element.querySelector('[data-layout-command="brush"]').getAttribute('aria-pressed') === 'true' && element.querySelector('[data-layout-canvas]').hasAttribute('data-layout-brush'));
  await click('[data-layout-canvas] [data-layout-node="total"]');
  { const style = find(layout(), 'total').style, from = find(layout(), 'derived').style;
    check('a click gives a block the brush\'s style', style?.font === from.font && style?.background === from.background && !style.gap); }
  await key('Escape');
  check('Escape puts the brush down', element.querySelector('[data-layout-command="brush"]').getAttribute('aria-pressed') === 'false');
  await key('z', {ctrlKey: true});
  // Layers: select, rename, fold, drag into another section.
  const layer = id => element.querySelector(`[data-layout-layers] [data-layer-node="${id}"]`);
  check('the Layers list every block', ['root', 'main', 'top', 'stats', 'derived', 'total'].every(layer));
  await click('[data-layout-layers] [data-layer-node="total"]');
  check('a click in the Layers selects the block', element.querySelector('[data-layout-selected]')?.dataset.layoutNode === 'total' && layer('total').getAttribute('aria-selected') === 'true');
  layer('derived').querySelector('[data-layer-renamable]').dispatchEvent(new MouseEvent('dblclick', {bubbles: true})); await wait();
  { const input = element.querySelector('[data-layer-rename="derived"]'); check('a double click renames in place', document.activeElement === input);
    if (input) { input.value = 'Derived values'; input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})); await wait(); } }
  check('the new name is the section\'s title', find(layout(), 'derived').labelKey === 'Derived values' && layer('derived').textContent.includes('Derived values'));
  await click('[data-layout-layers] [data-layer-toggle="derived"]');
  check('folding a section hides its rows', !layer('total') && layer('derived').getAttribute('aria-expanded') === 'false');
  await click('[data-layout-layers] [data-layer-toggle="derived"]');
  await drag(layer('total'), layer('stats'));
  check('dragging a row onto a section in the Layers moves the block into it', find(layout(), 'stats').children.some(c => c.id === 'total'));
  await key('z', {ctrlKey: true});
  { const column = element.querySelector('.rta-sheet-editor__layers-column'), rows = [...element.querySelectorAll('[data-layout-layers] [data-layer-node]')], last = rows.at(-1);
    // Short window: the Layers' zone scrolls; the last block, picked on the sheet, is brought into it.
    column.style.maxBlockSize = '8rem'; column.scrollTop = 0;
    await click(`[data-layout-canvas] [data-layout-node="${last.dataset.layerNode}"]`);
    const row = element.querySelector(`[data-layout-layers] [data-layer-node="${last.dataset.layerNode}"]`), r = row.getBoundingClientRect(), c = column.getBoundingClientRect();
    check('the Layers scroll to the block picked on the sheet', column.scrollTop > 0 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1);
    column.style.maxBlockSize = ''; }
  // Preview widths, and the sheet's own window width.
  const canvasWidth = () => Math.round(element.querySelector('[data-layout-canvas]').getBoundingClientRect().width);
  // The middle zone may be narrower than the sheet's window: the preview then takes all of it.
  const room = () => Math.round(element.querySelector('.rta-sheet-editor__stage').getBoundingClientRect().width);
  check(`the preview starts at the sheet's window width (${canvasWidth()}px, room ${room()}px)`, canvasWidth() === Math.min(640, room()));
  await click('[data-layout-widths] [data-layout-width="narrow"]');
  check(`a narrow preview (${canvasWidth()}px)`, canvasWidth() === 400);
  await set('[name="sheetWindowWidth"]', '500');
  await click('[data-layout-widths] [data-layout-width="window"]');
  check(`a preview at the sheet's window width (${canvasWidth()}px)`, canvasWidth() === 500);
  await click('[data-layout-widths] [data-layout-width="wide"]');
  check(`the whole width (${canvasWidth()}px)`, canvasWidth() === room() && canvasWidth() > 500);
  await set('[name="sheetWindowHeight"]', '640');
  element.querySelector('[data-entry-form]').requestSubmit(); await new Promise(r => setTimeout(r, 200));
  check('the window size is saved with the sheet', JSON.stringify(api.getSheetDefinition(fixture.versionId, 'sh1').window) === JSON.stringify({width: 500, height: 640}));
  // Block templates: a section saved as a template, offered in the palette's "Templates", inserted, renamed, exported, deleted.
  const draft = () => api.getRulesetVersion(fixture.versionId)?.workingDraft ?? api.getRuleset(fixture.versionId);
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  globalThis.__answer = 'Derived block';
  await click('[data-layout-properties] [data-layout-command="saveTemplate"]'); await wait();
  const kept = draft().sheetTemplates?.find(entry => entry.nameKey === 'Derived block');
  check('saving a section as a template', kept?.root?.kind === 'section' && kept.root.children.length === find(layout(), 'derived').children.length);
  const offered = id => element.querySelector(`[data-layout-palette-host] [data-layout-palette-keep] [data-layout-palette*='"templateId":"${id}"']`);
  check('it is offered in the palette\'s Templates, the card template is not (an Item\'s)', Boolean(offered(kept?.id)) && !offered('gear-card'));
  await click('[data-layout-canvas] [data-layout-node="top"]');
  const count = find(layout(), 'top').children.length;
  await click(`[data-layout-palette-host] [data-layout-palette*='"templateId":"${kept?.id}"']`);
  { const copy = find(layout(), 'top').children.at(-1);
    check('a click inserts an independent copy', find(layout(), 'top').children.length === count + 1 && copy.kind === 'section' && copy.id !== 'derived' && copy.children.length === kept.root.children.length && copy.children.every(child => !find(kept.root, child.id))); }
  await key('z', {ctrlKey: true});
  globalThis.__answer = 'Derived values block';
  await click(`[data-layout-template-command="rename"][data-template-id="${kept?.id}"]`);
  check('renaming a template', draft().sheetTemplates.find(entry => entry.id === kept?.id)?.nameKey === 'Derived values block' && offered(kept?.id)?.textContent.includes('Derived values block'));
  const downloads = [];
  foundry.utils = {saveDataToFile: (text, type, name) => downloads.push({text, name})};
  await click(`[data-layout-template-command="export"][data-template-id="${kept?.id}"]`);
  check('exporting a template as a file', downloads[0]?.name === 'Derived values block.json' && JSON.parse(downloads[0].text).format === 'rule-them-all.sheet-template');
  await click(`[data-layout-template-command="delete"][data-template-id="${kept?.id}"]`);
  check('deleting a template', !draft().sheetTemplates.some(entry => entry.id === kept?.id) && !offered(kept?.id));
  // Contents as cards: the fields chosen, then a card template; that template cannot be deleted while it draws cards.
  await click('[data-layout-canvas] [data-layout-node="derived"]');
  await click('[data-layout-palette-host] [data-layout-palette=\'{"kind":"contents"}\']');
  const held = find(layout(), 'derived').children.at(-1);
  check('adding the held Contents', held?.kind === 'contents');
  await set('[data-layout-properties] [data-layout-prop="cards"]', 'cards');
  { const fields = element.querySelector('[data-layout-properties] [data-layout-prop="cardFields"]');
    for (const option of fields?.options ?? []) option.selected = ['weight', 'price'].includes(option.value);
    fields?.dispatchEvent(new Event('change', {bubbles: true})); await wait(); }
  check('cards of the fields chosen', JSON.stringify(find(layout(), held.id).cards) === '{"fieldIds":["weight","price"]}' && element.querySelectorAll(`[data-layout-canvas] [data-layout-node="${held.id}"] .rta-sheet-card`).length > 0);
  await set('[data-layout-properties] [data-layout-prop="cardTemplate"]', 'gear-card');
  check('cards drawn with a template', find(layout(), held.id).cards?.templateRef === 'gear-card' && element.querySelector(`[data-layout-canvas] [data-layout-node="${held.id}"] .rta-sheet-card .rta-sheet-name`));
  element.querySelector('[data-entry-form]').requestSubmit(); await new Promise(r => setTimeout(r, 200));
  check(`saving the cards${(await app._prepareContext({})).error ?? ''}`, JSON.stringify(find(api.getSheetDefinition(fixture.versionId, 'sh1').root, held.id)?.cards) === '{"templateRef":"gear-card"}');
  { let refused = null; try { await api.deleteSheetTemplate(fixture.versionId, 'gear-card'); } catch (error) { refused = error; }
    check('a template that draws cards is kept', draft().sheetTemplates.some(entry => entry.id === 'gear-card') && refused?.consumers?.some(edge => edge.consumerRef?.objectId === 'sh1')); }
  // The sheet's theme, one color of its own, and an image frame on a section.
  await set('[data-layout-theme-host] [data-layout-theme="id"]', 'parchment');
  const theme = () => JSON.parse(element.querySelector('[data-sheet-theme-value]').value || 'null');
  check('choosing the Parchment theme', theme()?.id === 'parchment' && element.querySelector('[data-layout-canvas] .rta-sheet-theme--parchment'));
  await set('[data-layout-theme-host] [data-layout-theme="accent"]', '#aa2200');
  check('a color of its own', theme()?.overrides?.accent === '#aa2200' && /--rta-sheet-accent:\s*#aa2200/.test(element.querySelector('[data-layout-canvas] .rta-sheet-themed')?.getAttribute('style') ?? '') && element.querySelector('[data-layout-theme-reset="accent"]'));
  await click('[data-layout-theme-reset="accent"]');
  check('back to the theme\'s color', !theme()?.overrides?.accent);
  await click('[data-layout-canvas] [data-layout-node="stats"]');
  await set('[data-layout-properties] [data-layout-style="frame"]', 'icons/svg/frame.svg');
  await set('[data-layout-properties] [data-layout-style="frameWidth"]', 'small');
  check('an image frame on a section', JSON.stringify(find(layout(), 'stats').style) === '{"frame":"icons/svg/frame.svg","frameWidth":"small"}' && /border-image/.test(element.querySelector('[data-layout-canvas] section[data-layout-node="stats"]')?.getAttribute('style') ?? ''));
  downloads.length = 0;
  await click('[data-sheet-file="export"]');
  { const file = downloads[0] && JSON.parse(downloads[0].text);
    check('exporting the sheet brings its card template', file?.format === 'rule-them-all.sheet' && file.sheet?.theme?.id === 'parchment' && file.templates?.some(entry => entry.id === 'gear-card')); }
  element.querySelector('[data-entry-form]').requestSubmit(); await new Promise(r => setTimeout(r, 200));
  check('saving the theme', api.getSheetDefinition(fixture.versionId, 'sh1').theme?.id === 'parchment');
  // Leave a value selected for the screenshot.
  await click('[data-layout-canvas] [data-layout-node="stat-value"]');
  return steps;
}, {fixture, en, urls: {api: url('src/configurator/configurator-api.mjs'), editor: url('src/configurator/configurator-entry-editor.mjs'), clipboard: url('src/configurator/sheet-layout-clipboard.mjs')}});
if (process.env.RTA_SHOTS) {
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-flow.png')});
  // Scrolled down: the tools stay beside the sheet; then the bottom of the tools column, with the palette.
  await page.evaluate(() => { const scroll = document.querySelector('.rta-sheet-editor__main'); scroll.scrollTop = scroll.scrollHeight; });
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
    document.querySelector('.rta-sheet-editor__side').scrollTop = 0; document.querySelector('.rta-sheet-editor__main').scrollTop = 0;
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
  // A sheet without the standard header: name, portrait and token image placed at the top of the first tab's grid, the token selected.
  await page.evaluate(async () => {
    const wait = () => new Promise(r => setTimeout(r, 60)), header = document.querySelector('[name="sheetHeader"]');
    header.value = 'none'; header.dispatchEvent(new Event('change', {bubbles: true})); await wait();
    document.querySelector('[data-layer-node="top"]')?.click(); await wait();
    for (const kind of ['name', 'portrait', 'token']) { document.querySelector(`[data-layout-palette-host] [data-layout-palette='{"kind":"${kind}"}']`).click(); await wait(); }
    for (const kind of ['token', 'portrait', 'name']) {
      document.querySelector(`[data-layout-canvas] .rta-sheet-${kind === 'name' ? 'name' : `picture[data-layout-node^="${kind}"]`}`)?.click(); await wait();
      while (!document.querySelector('[data-layout-command="up"]')?.disabled) { document.querySelector('[data-layout-command="up"]').click(); await wait(); }
    }
    document.querySelector('[data-layout-canvas] [data-layout-node^="token"]')?.click(); await wait();
    document.querySelector('.rta-sheet-editor__side').scrollTop = 0; document.querySelector('.rta-sheet-editor__main').scrollTop = 0;
  });
  await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-document.png')});
}
// Narrower windows: at 1180 px the three zones narrow; at 900 px the Layers go under the tools; at 600 px all is stacked
// in one scroll. The buttons stay at the bottom every time.
// The last block selected in the wide window, then the window narrowed: its Layers row is brought into the shorter zone.
await page.evaluate(() => { const rows = document.querySelectorAll('[data-layout-layers] [data-layer-node]'); document.querySelector(`[data-layout-canvas] [data-layout-node="${rows[rows.length - 1].dataset.layerNode}"]`)?.click(); });
await page.setViewportSize({width: 900, height: 1100});
await page.waitForTimeout(100);
{ const seen = await page.evaluate(() => { const column = document.querySelector('.rta-sheet-editor__layers-column'), r = column.querySelector('[aria-selected="true"]').getBoundingClientRect(), c = column.getBoundingClientRect(); return column.scrollTop > 0 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1; });
  console.log(`${seen ? 'ok' : 'FAIL'} the selected Layers row stays in view when the window narrows`); if (!seen) result.push('FAIL Layers row after resize'); }
await page.setViewportSize({width: 1320, height: 1100});
// A value block selected: the settings with the longest choices.
await page.evaluate(() => document.querySelector('[data-layout-canvas] [data-layout-node="stat-value"]')?.click());
for (const width of [1320, 1180, 900, 600]) {
  await page.setViewportSize({width, height: 1100});
  await page.waitForTimeout(100);
  const narrow = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect(), side = box('.rta-sheet-editor__side'), main = box('.rta-sheet-editor__main'), layers = box('.rta-sheet-editor__layers-column'), footer = box('.rta-config-entry__footer'), app = box('.application');
    const page = document.documentElement;
    return {three: side.right <= main.left + 1 && main.right <= layers.left + 1, under: Math.abs(layers.left - side.left) < 1 && layers.top >= side.bottom - 1 && side.right <= main.left + 1,
      stacked: main.top >= side.bottom - 1, footer: footer.height > 0 && footer.bottom <= app.bottom + 1, overflow: page.scrollWidth > page.clientWidth,
      // The selected block's settings: no value cut short, the text fields wide enough to read.
      cut: [...document.querySelectorAll('[data-layout-properties] .rta-select__value')].filter(value => value.scrollWidth > value.clientWidth + 1).map(value => value.textContent.trim()),
      thin: [...document.querySelectorAll('[data-layout-properties] input[type="text"]')].filter(input => input.getBoundingClientRect().width && input.getBoundingClientRect().width < 120).map(input => input.dataset.layoutProp ?? input.dataset.layoutStyle),
      // The selected row of the Layers is in view after the resize.
      row: (() => { const column = document.querySelector('.rta-sheet-editor__layers-column'), row = column.querySelector('[aria-selected="true"]'); if (!row || column.scrollHeight <= column.clientHeight) return true; const r = row.getBoundingClientRect(), c = column.getBoundingClientRect(); return r.top >= c.top - 1 && r.bottom <= c.bottom + 1; })()};
  });
  const layout = width >= 1180 ? narrow.three : width >= 900 ? narrow.under : narrow.stacked;
  const fields = width < 1180 || (!narrow.cut.length && !narrow.thin.length), good = layout && narrow.footer && !narrow.overflow && narrow.row && fields;
  console.log(`${good ? 'ok' : 'FAIL'} at ${width}px: ${width >= 1180 ? 'three zones' : width >= 900 ? 'the Layers under the tools' : 'one column'}, the buttons and the selected Layers row in view${width >= 1180 ? ', the block\'s settings readable' : ''}${narrow.cut.length || narrow.thin.length ? ` (cut: ${narrow.cut.join(' / ')}; thin: ${narrow.thin.join(', ')})` : ''}${narrow.row ? '' : ' (Layers row out of view)'}`);
  if (!good) result.push(`FAIL at ${width}px`);
  if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, `sheet-editor-${width}.png`)});
}
// The side panels: hidden by their button (the sheet takes the room), shown again, and the tools' bar dragged wider.
await page.setViewportSize({width: 1320, height: 1100});
await page.waitForTimeout(100);
{
  const width = () => page.evaluate(() => Math.round(document.querySelector('.rta-sheet-editor__main').getBoundingClientRect().width));
  const before = await width();
  await page.click('[data-panel-toggle="side"]'); await page.click('[data-panel-toggle="layers"]'); await page.waitForTimeout(50);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('.rta-sheet-editor__side, .rta-sheet-editor__layers-column')].every(el => !el.getBoundingClientRect().width));
  const wide = await width();
  if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-panels-hidden.png')});
  await page.click('[data-panel-toggle="side"]'); await page.click('[data-panel-toggle="layers"]'); await page.waitForTimeout(50);
  const back = await width();
  const bar = await page.evaluate(() => { const r = document.querySelector('[data-panel-resizer="side"]').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
  const side = () => page.evaluate(() => Math.round(document.querySelector('.rta-sheet-editor__side').getBoundingClientRect().width));
  const sideBefore = await side();
  await page.mouse.move(bar.x, bar.y); await page.mouse.down(); await page.mouse.move(bar.x + 80, bar.y, {steps: 4}); await page.mouse.up();
  const sideAfter = await side();
  await page.dblclick('[data-panel-resizer="side"]', {position: {x: 6, y: 300}});
  const reset = await side();
  const good = hidden && wide > before + 300 && back === before && sideAfter >= sideBefore + 70 && reset === sideBefore;
  console.log(`${good ? 'ok' : 'FAIL'} the side panels hide, come back and the tools widen by dragging their bar (sheet ${before} → ${wide} → ${back} px, tools ${sideBefore} → ${sideAfter} → ${reset} px)`);
  if (!good) result.push('FAIL side panels');
}
// Right click on a block of the sheet: it is selected and its commands are offered; Duplicate runs from the menu.
{
  const before = await page.evaluate(() => document.querySelectorAll('[data-layout-canvas] [data-layout-node]').length);
  await page.click('[data-layout-canvas] [data-layout-node="stat-value"]', {button: 'right'});
  await page.waitForTimeout(50);
  const menu = await page.evaluate(() => ({labels: [...document.querySelectorAll('#context-menu .context-item')].map(item => item.textContent.trim()), selected: document.querySelector('[data-layer-node][aria-selected="true"]')?.dataset.layerNode}));
  if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-context-menu.png')});
  await page.evaluate(() => [...document.querySelectorAll('#context-menu .context-item')].find(item => item.textContent.includes('Duplicate'))?.click());
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => document.querySelectorAll('[data-layout-canvas] [data-layout-node]').length);
  const good = menu.selected === 'stat-value' && menu.labels.some(label => label.startsWith('Copy')) && menu.labels.some(label => label.startsWith('Remove')) && after > before;
  console.log(`${good ? 'ok' : 'FAIL'} right click selects the block and offers its commands (${menu.labels.join(', ')}), Duplicate runs from it`);
  if (!good) result.push('FAIL context menu');
}
// The left panel's tabs, the path above the block's settings, the outline of the hovered block.
{
  await page.click('[data-layout-canvas] [data-layout-node="stat-value"]');
  const crumbs = await page.evaluate(() => [...document.querySelectorAll('.rta-sheet-editor__crumbs [data-layout-crumb]')].map(b => b.textContent));
  await page.click('.rta-sheet-editor__crumbs [data-layout-crumb]:last-of-type');
  const parent = await page.evaluate(() => document.querySelector('[data-layer-node][aria-selected="true"]')?.dataset.layerNode);
  await page.click('[data-layout-pane="add"]');
  const add = await page.evaluate(() => ({shown: document.querySelector('[data-layout-palette-host]').getBoundingClientRect().height > 0 && !document.querySelector('[data-layout-properties]').getBoundingClientRect().height, into: document.querySelector('[data-layout-add-target]')?.textContent}));
  if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-pane-add.png')});
  await page.click('[data-layout-pane="theme"]');
  if (process.env.RTA_SHOTS) await page.screenshot({path: join(process.env.RTA_SHOTS, 'sheet-editor-pane-theme.png')});
  await page.click('[data-layout-canvas] [data-layout-node="stat-value"]');
  const back = await page.evaluate(() => document.querySelector('[data-layout-properties]').getBoundingClientRect().height > 0 && !document.querySelector('[data-layout-theme-host]').getBoundingClientRect().height);
  await page.hover('[data-layout-canvas] [data-layout-node="stats"]', {position: {x: 6, y: 6}});
  const hover = await page.evaluate(() => [...document.querySelectorAll('[data-layout-hover]')].map(e => e.dataset.layoutNode ?? `layer:${e.dataset.layerNode}`));
  const good = crumbs.length >= 2 && parent && parent !== 'stat-value' && add.shown && add.into && back && hover.includes('stats') && hover.includes('layer:stats') && hover.length === 2;
  console.log(`${good ? 'ok' : 'FAIL'} the path (${crumbs.join(' › ')}) selects a parent, the tabs switch (adds into ${add.into}), a block picked leaves the theme tab, the hovered block lights up on the sheet and in the Layers (${hover.join(', ')})`);
  if (!good) result.push('FAIL tabs, path, hover');
}
await browser.close();
for (const line of [...result, ...errors.map(e => `FAIL error: ${e}`)]) console.log(line);
const failed = result.filter(line => line.startsWith('FAIL')).length + errors.length;
console.log(failed ? `sheet editor: ${failed} failure(s)` : 'sheet editor: PASS');
process.exitCode = failed ? 1 : 0;
