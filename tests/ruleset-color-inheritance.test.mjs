import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {validateRulesetSchema} from '../src/configurator/configurator-validation.mjs';
import {RULESET_SECTIONS,DEFAULT_RULESET_COLOR,rulesetColor,sectionColor,collectionColor,objectColor,sectionForCollection,mayOverrideSection} from '../src/configurator/ruleset-colors.mjs';
import {COLLECTION_FIELDS} from '../src/configurator/configurator-schema.mjs';
import {createSelectColorResolver} from '../src/ui/select-option-presentation.mjs';
import {collectEntryData} from '../src/configurator/entry-data-collector.mjs';

class Storage {
  constructor(){this.snapshot=emptyStorageSnapshot();}
  async load(){return structuredClone(this.snapshot);}
  async save(value){this.snapshot=structuredClone(value);}
}
const base={id:'color-rules',nameKey:'Colors',version:'1.0.0'};
const type={id:'element',key:'element',nameKey:'Element',color:'#c17d9e',fields:{},allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[]};

test('each existing Ruleset collection belongs to exactly one navigational section',()=>{
  assert.deepEqual(RULESET_SECTIONS.flatMap(x=>x.collections).sort(),[...COLLECTION_FIELDS].sort());
  for(const family of COLLECTION_FIELDS)assert.ok(sectionForCollection(family));
  assert.equal(DEFAULT_RULESET_COLOR,'#666666');
});

test('all unresolved colors default to #666666; a section never silently inherits the Ruleset color',()=>{
  const ruleset={...base,color:'#a1b2c3',sectionColors:{},sectionColorOverrides:{},familyColors:{}};
  assert.equal(rulesetColor(ruleset),'#a1b2c3');
  assert.equal(sectionColor(ruleset,'rules'),'#666666');
  assert.equal(objectColor(ruleset,'definitionTypes',type),'#666666');
  assert.equal(collectionColor(ruleset,'parameters'),'#666666');
  assert.equal(mayOverrideSection(ruleset,'rules'),false);
});

test('overrides are enabled separately, preserve previous values when off, and reappear when reenabled',()=>{
  const ruleset={...base,sectionColors:{definitions:'#234567',rules:'#345678',advanced:'#abc123'},sectionColorOverrides:{definitions:false,rules:false,advanced:false},familyColors:{parameters:'#765432'},definitionTypes:[type]};
  const choice=color=>createSelectColorResolver({definitionTypes:[type],ruleset:color});
  assert.equal(objectColor(ruleset,'definitionTypes',type),'#234567');
  assert.equal(collectionColor(ruleset,'parameters'),'#345678');
  assert.deepEqual(choice(ruleset)('definition',{definitionTypeId:'element'}),['#234567']);
  assert.deepEqual(choice(ruleset)('parameter',{id:'p'}),['#345678']);
  ruleset.sectionColorOverrides.definitions=true;ruleset.sectionColorOverrides.rules=true;
  assert.equal(objectColor(ruleset,'definitionTypes',type),'#c17d9e');
  assert.equal(collectionColor(ruleset,'parameters'),'#765432');
  ruleset.sectionColorOverrides.definitions=false;ruleset.sectionColorOverrides.rules=false;
  assert.equal(ruleset.definitionTypes[0].color,'#c17d9e');
  assert.equal(ruleset.familyColors.parameters,'#765432');
  assert.deepEqual(choice(ruleset)('definition',{definitionTypeId:'element'}),['#234567']);
  ruleset.sectionColorOverrides.definitions=true;
  assert.deepEqual(choice(ruleset)('definition',{definitionTypeId:'element'}),['#c17d9e']);
});

test('Ruleset editor patch retains existing collection overrides, IDs, collections and unrelated metadata',async()=>{
  const storage=new Storage(),api=await createConfiguratorAPI(storage);
  const {versionId}=await api.createRuleset({...base,sectionColors:{rules:'#212121'},familyColors:{parameters:'#aabbcc'}});
  await api.registerDefinitionType(versionId,type);
  const current=api.getRuleset(versionId);
  const form=new FormData();form.set('nameKey','Revised');form.set('descriptionKey','New description');form.set('version','1.0.0');form.set('rulesetColor','#123456');
  for(const section of RULESET_SECTIONS)form.set(`sectionColor:${section.id}`,section.id==='definitions'?'#3a4b5c':'#666666');
  form.set('sectionOverride:definitions','on');form.set('sectionOverride:rules','on');
  const data=collectEntryData('ruleset',{fd:form,current,bool:name=>form.has(name),checkedIds:()=>[],queryOne:()=>null,queryAll:()=>[],uid:()=>'',fieldUid:()=>''});
  assert.deepEqual(data.familyColors,{parameters:'#aabbcc'});
  await api.updateRuleset(versionId,data);
  const reloaded=await createConfiguratorAPI(storage);
  const saved=reloaded.getRuleset(versionId);
  assert.equal(saved.nameKey,'Revised');
  assert.equal(saved.descriptionKey,'New description');
  assert.equal(saved.id,current.id);
  assert.equal(saved.color,'#123456');
  assert.equal(sectionColor(saved,'definitions'),'#3a4b5c');
  assert.equal(objectColor(saved,'definitionTypes',saved.definitionTypes[0]),'#c17d9e');
  assert.equal(collectionColor(saved,'parameters'),'#aabbcc');
  assert.equal(saved.definitionTypes[0].id,'element');
  assert.equal(saved.sectionColorOverrides.rules,true);
  assert.equal(validateRulesetSchema(saved).valid,true);
  await reloaded.updateRuleset(versionId,{sectionColorOverrides:{...saved.sectionColorOverrides,definitions:false,rules:false}});
  const disabled=reloaded.getRuleset(versionId);
  assert.equal(objectColor(disabled,'definitionTypes',disabled.definitionTypes[0]),'#3a4b5c');
  assert.equal(collectionColor(disabled,'parameters'),'#666666');
  assert.equal(disabled.familyColors.parameters,'#aabbcc');
  await reloaded.updateRuleset(versionId,{sectionColorOverrides:{...disabled.sectionColorOverrides,definitions:true,rules:true}});
  assert.equal(collectionColor(reloaded.getRuleset(versionId),'parameters'),'#aabbcc');
  assert.equal(objectColor(reloaded.getRuleset(versionId),'definitionTypes',type),'#c17d9e');
});

test('invalid CSS injection and unknown section IDs are rejected before persistence',async()=>{
  const api=await createConfiguratorAPI(new Storage());
  const {versionId}=await api.createRuleset(base);
  await assert.rejects(()=>api.updateRuleset(versionId,{color:'red; background:url(bad)'}));
  await assert.rejects(()=>api.updateRuleset(versionId,{sectionColors:{invented:'#123456'}}));
  await assert.rejects(()=>api.updateRuleset(versionId,{sectionColorOverrides:{rules:'yes'}}));
});

test('General view and source editors expose only the governed color controls',()=>{
  const home=fs.readFileSync(new URL('../templates/configurator/configurator.hbs',import.meta.url),'utf8');
  const form=fs.readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles/configurator.css',import.meta.url),'utf8');
  assert.match(home,/data-action="editRuleset"/);
  assert.match(home,/rta-general" style="--rta-card-accent:\{\{rulesetAccent\}\}"/);
  assert.match(home,/rta-ruleset-tile" role="listitem" style="--rta-card-accent:\{\{color\}\}"/);
  assert.match(home,/data-collection-color/);
  assert.match(form,/name="rulesetColor"/);
  assert.match(form,/name="sectionOverride:\{\{id\}\}"/);
  assert.match(form,/data-color-override-toggle/);
  assert.doesNotMatch(css,/\.rta-explorer__icon--definitions/);
  assert.doesNotMatch(css,/#c58b64|#7da8c8|#a98cc8|#c5a46c/i);
});
