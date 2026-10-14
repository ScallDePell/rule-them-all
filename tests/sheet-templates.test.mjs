import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {projectSheet} from '../src/runtime/sheet-projection.mjs';
import {layoutTarget, prepareLayout} from '../src/configurator/layout-contract.mjs';
import {cardTemplates, importedSheet, importedTemplate, insertTemplate, prunedSheet, readSheetFile, sheetFile, templateFile, templateFromBlock, templateNamed, templatesFor} from '../src/configurator/sheet-templates.mjs';
import {FALLBACK_FONTS, availableFonts, frameDeclarations, prepareSheetTheme, sheetThemeAttributes} from '../src/configurator/sheet-themes.mjs';
import {paletteGroups} from '../src/configurator/sheet-layout-model.mjs';
import {renderSheetHTML} from '../src/ui/sheet-markup.mjs';

class Storage { value = emptyStorageSnapshot(); async load() { return structuredClone(this.value); } async save(v) { this.value = structuredClone(v); } }
const hero = {kind: 'actor', id: 'hero'};
const field = (id, valueType) => ({id, name: id, valueType, cardinality: 'one', nullable: false, required: false, constraints: []});
const out = (objectId, capabilityId, outputId) => ({objectKind: 'definition', objectId, capabilityId, outputId});
const statBlock = {id: 'stats', kind: 'section', labelKey: 'Stats', span: 2, columns: 1, children: [{id: 'str-value', kind: 'value', source: {kind: 'output', reference: out('str', 'value', 'value.final')}}]};
const weaponCard = {id: 'card', kind: 'section', columns: 2, children: [{id: 'card-face', kind: 'portrait'}, {id: 'card-name', kind: 'name'}, {id: 'card-damage', kind: 'value', source: {kind: 'field', fieldId: 'damage'}}]};

async function setup() {
  const api = await createConfiguratorAPI(new Storage());
  const v = (await api.createRuleset({id: 'g', nameKey: 'Game', version: '1'})).versionId;
  await api.registerDefinitionType(v, {id: 'attribute', key: 'attribute', nameKey: 'Attributes', allowedCapabilities: ['value'], defaultCapabilities: ['value'], requiredCapabilities: [], fields: {}});
  await api.createDefinition(v, {id: 'str', key: 'str', definitionTypeId: 'attribute', nameKey: 'Strength', data: {}, capabilities: ['value']});
  await api.createContentType(v, {id: 'weapon', nameKey: 'Weapon', storageKind: 'item', runtimeMode: 'unique', fields: {damage: field('damage', 'string'), reach: field('reach', 'number')}});
  await api.createContentTemplate(v, {id: 'sword', nameKey: 'Sword', contentTypeId: 'weapon', data: {damage: '1d8', reach: 1}, relations: [], choiceGroups: []});
  return {api, v, draft: () => api.getRulesetVersion(v)?.workingDraft ?? api.getRuleset(v)};
}

test('a block template is kept in the Ruleset, offered to the sheets it fits, and its Definitions cannot be deleted under it', async () => {
  const {api, v, draft} = await setup();
  const made = templateFromBlock(statBlock, 'Stats block', draft());
  assert.equal(made.data.id, 'template-stats-block');
  assert.equal(made.data.root.span, undefined, 'its width is the place\'s');
  await api.createSheetTemplate(v, made.data);
  await api.createSheetTemplate(v, {id: 'weapon-card', nameKey: 'Weapon card', root: weaponCard});
  await api.createSheetTemplate(v, {id: 'pawn', nameKey: 'Token', root: {id: 'pawn', kind: 'token'}});
  assert.equal(templateNamed(draft(), ' stats BLOCK ')?.id, 'template-stats-block');
  assert.deepEqual(templatesFor(draft(), 'actor').map(t => t.id), ['template-stats-block', 'pawn']);
  assert.deepEqual(templatesFor(draft(), 'item').map(t => t.id), ['template-stats-block', 'weapon-card'], 'a token image is an Actor\'s only');
  assert.deepEqual(cardTemplates(draft()).map(t => t.id), ['template-stats-block', 'weapon-card'], 'what fits an Item sheet, without a token image');
  assert.equal(layoutTarget(weaponCard), 'item');
  assert.equal(layoutTarget(statBlock), 'any');
  assert.equal(layoutTarget({id: 'n', kind: 'notes'}), 'actor', 'notes are kept on the Actor');
  await assert.rejects(api.createSheetTemplate(v, {id: 'both', nameKey: 'Both', root: {id: 'b', kind: 'grid', children: [{id: 't', kind: 'token'}, {id: 'f', kind: 'value', source: {kind: 'field', fieldId: 'damage'}}]}}), /Actor|Item/);
  await assert.rejects(api.deleteDefinition(v, 'str'), /still referenced/);
  assert.deepEqual(templateFromBlock({id: 'row', kind: 'value', source: {kind: 'each', capabilityId: 'value', outputId: 'value.final'}}, 'Row', draft()), {error: 'each'});
  // The palette's "Templates" group, without the templates of a type left out of the sheet palette.
  const group = paletteGroups(draft(), {target: 'actor'}).find(g => g.id === 'templates');
  assert.deepEqual(group.items.map(item => item.spec), [{kind: 'template', templateId: 'template-stats-block'}, {kind: 'template', templateId: 'pawn'}]);
});

test('a template is inserted as an independent copy, refused where it does not fit or names what is missing', async () => {
  const {api, v, draft} = await setup();
  await api.createSheetTemplate(v, {id: 'stats', nameKey: 'Stats', root: statBlock});
  await api.createSheetTemplate(v, {id: 'pawn', nameKey: 'Token', root: {id: 'pawn', kind: 'token'}});
  const root = prepareLayout({id: 'root', kind: 'grid', columns: 2, children: [{id: 'stats', kind: 'section', children: []}]});
  const template = draft().sheetTemplates.find(t => t.id === 'stats');
  const once = insertTemplate(root, template, 'root', draft());
  const copy = once.root.children.at(-1);
  assert.equal(copy.id, once.id);
  assert.notEqual(copy.id, 'stats', 'new ids');
  assert.notEqual(copy.children[0].id, 'str-value');
  copy.children[0].labelKey = 'Changed';
  assert.equal(draft().sheetTemplates.find(t => t.id === 'stats').root.children[0].labelKey, undefined, 'the template is not changed by its copies');
  const dropped = insertTemplate(root, template, 'stats', draft(), {before: true, beside: true});
  assert.equal(dropped.root.children[0].id, dropped.id, 'dropped before a block');
  const token = draft().sheetTemplates.find(t => t.id === 'pawn');
  assert.equal(insertTemplate(root, token, 'root', draft(), {target: 'item'}).error, 'missing');
  const lacking = {...draft(), definitions: []};
  assert.deepEqual(insertTemplate(root, template, 'root', lacking), {error: 'missing', missing: ['str']});
});

test('sheets and templates go to a file and come back, with what the Ruleset lacks reported and left out on request', async () => {
  const {api, v, draft} = await setup();
  await api.createSheetTemplate(v, {id: 'weapon-card', nameKey: 'Weapon card', root: weaponCard});
  const sheet = await api.createSheetDefinition(v, {id: 'hero', nameKey: 'Hero', target: 'actor', theme: {id: 'gothic', overrides: {accent: '#aa2200'}}, root: {id: 'root', kind: 'grid', columns: 2, children: [
    statBlock, {id: 'arms', kind: 'contents', contentTypeIds: ['weapon'], cards: {templateRef: 'weapon-card'}}]}});
  await assert.rejects(api.deleteSheetTemplate(v, 'weapon-card'), error => error.consumers?.some(edge => edge.consumerRef?.objectId === 'hero'));
  const text = JSON.stringify(sheetFile(api.getSheetDefinition(v, 'hero') ?? sheet, draft()));
  const read = readSheetFile(text);
  assert.equal(read.kind, 'sheet');
  assert.deepEqual(read.sheet.theme, {id: 'gothic', overrides: {accent: '#aa2200'}});
  assert.deepEqual(read.templates.map(t => t.id), ['weapon-card']);
  // Into a Ruleset that has the weapons but not the Definition, nor the card template.
  const other = {...draft(), definitions: [], sheetTemplates: []};
  const found = importedSheet(read, other);
  assert.deepEqual(found.missing, ['str']);
  assert.deepEqual(found.templates.map(t => t.id), ['weapon-card'], 'the card template comes with the file');
  const pruned = prunedSheet(found, other);
  assert.deepEqual(pruned.sheet.root.children.map(c => c.id), ['stats', 'arms']);
  assert.deepEqual(pruned.sheet.root.children[0].children, [], 'the block naming the missing Definition is left out');
  // A template file.
  const file = readSheetFile(JSON.stringify(templateFile(draft().sheetTemplates[0])));
  assert.equal(file.kind, 'template');
  assert.equal(importedTemplate(file.template, draft()).template.id, 'weapon-card-2', 'a free id');
  assert.deepEqual(importedTemplate(file.template, {...draft(), contentTypes: []}).missing, ['damage']);
  assert.throws(() => readSheetFile('{"format":"other"}'), error => error.code === 'format');
  assert.throws(() => readSheetFile('not json'), error => error.code === 'format');
});

test('held Contents as cards: the fields chosen, or a card template whose values are the Content\'s fields', async () => {
  const {api, v} = await setup();
  await api.createSheetTemplate(v, {id: 'weapon-card', nameKey: 'Weapon card', root: weaponCard});
  await assert.rejects(api.createSheetDefinition(v, {id: 'bad', nameKey: 'Bad', target: 'actor', root: {id: 'root', kind: 'grid', children: [{id: 'c', kind: 'contents', cards: {style: 'big'}}]}}), /cards/);
  await api.publishRuleset(v);
  const adapter = new MemoryRuntimeAdapter(), engine = new RuntimeEngine({configurator: api, adapter, hooks: null});
  await engine.initializeContainer(v, hero, {definitionIds: ['str']});
  await engine.acquire(v, hero, {content: {key: 'item-1', templateId: 'sword', contentTypeId: 'weapon', }});
  const sheet = {id: 's', target: 'actor', theme: {id: 'parchment'}, root: prepareLayout({id: 'root', kind: 'grid', children: [
    {id: 'listed', kind: 'contents', contentTypeIds: ['weapon'], cards: {fieldIds: ['damage', 'reach']}},
    {id: 'drawn', kind: 'contents', contentTypeIds: ['weapon'], cards: {templateRef: 'weapon-card'}}]})};
  const view = await projectSheet(engine, v, sheet, {actor: hero, items: [{id: 'item-1', name: 'My blade', img: 'blade.webp', managed: true}]});
  assert.deepEqual(view.theme, {id: 'parchment'});
  const [listed, drawn] = view.root.children;
  assert.equal(listed.cards, 'fields');
  assert.deepEqual(listed.rows[0].fields.map(f => [f.label, f.value]), [['damage', '1d8'], ['reach', 1]]);
  assert.equal(drawn.cards, 'template');
  assert.deepEqual(drawn.rows[0].children[0].children.map(c => c.kind), ['portrait', 'name', 'value']);
  assert.equal(drawn.rows[0].children[0].children[2].value, '1d8');
  const html = renderSheetHTML(view, {t: key => key, name: 'Hero', editable: true});
  assert.match(html, /class="rta-sheet rta-sheet-themed rta-sheet-theme--parchment rta-sheet-themed--colored/);
  assert.match(html, /rta-sheet-card--template[\s\S]*<h2 class="rta-sheet-name__text">My blade<\/h2>/, 'a card\'s name block shows the Content');
  assert.match(html, /data-sheet-item-open="item-1"/);
});

test('sheet themes: a theme and its overrides, checked; their tokens and classes; image frames; the fonts offered', () => {
  assert.equal(prepareSheetTheme(undefined), undefined);
  assert.deepEqual(prepareSheetTheme({id: 'scifi', overrides: {accent: '#00ccff', font: 'Signika', frame: 'frames/gold.webp', frameSlice: 40, frameWidth: 'large', text: ''}}),
    {id: 'scifi', overrides: {accent: '#00ccff', font: 'Signika', frame: 'frames/gold.webp', frameSlice: 40, frameWidth: 'large'}});
  assert.throws(() => prepareSheetTheme({id: 'pink'}), /id must be/);
  assert.throws(() => prepareSheetTheme({id: 'gothic', overrides: {accent: 'red'}}), /#rrggbb/);
  assert.throws(() => prepareSheetTheme({id: 'gothic', overrides: {frameWidth: 'small'}}), /needs a frame picture/);
  assert.throws(() => prepareSheetTheme({id: 'gothic', overrides: {glow: true}}), /unsupported field: glow/);
  assert.deepEqual(sheetThemeAttributes({id: 'plain'}), {classes: ['rta-sheet-themed', 'rta-sheet-theme--plain'], css: []});
  const framed = sheetThemeAttributes({id: 'gothic', overrides: {page: '#101010', titleFont: 'Amiri', frame: 'f.webp', frameWidth: 'small'}});
  assert.deepEqual(framed.classes, ['rta-sheet-themed', 'rta-sheet-theme--gothic', 'rta-sheet-themed--colored', 'rta-sheet-themed--framed']);
  assert.deepEqual(framed.css, ['--rta-sheet-page: #101010', '--rta-sheet-font-title: "Amiri"', '--rta-sheet-section-frame: url("f.webp") 30 / 8px round', '--rta-sheet-section-frame-width: 8px']);
  assert.deepEqual(frameDeclarations('f.webp', 500, 'huge'), ['border-style: solid', 'border-width: 16px', 'border-image: url("f.webp") 200 / 16px round']);
  assert.deepEqual(frameDeclarations('a"); color: red'), [], 'nothing that would leave the url');
  assert.deepEqual(availableFonts(), [...FALLBACK_FONTS]);
  globalThis.CONFIG = {fontDefinitions: {'My Runes': {}, Signika: {}}};
  try { assert.deepEqual(availableFonts(), ['My Runes', 'Signika']); } finally { delete globalThis.CONFIG; }
});
