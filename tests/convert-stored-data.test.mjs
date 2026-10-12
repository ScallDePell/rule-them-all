import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {convertSnapshot} from '../tools/convert-stored-data.mjs';

// Saved by the module as it was just before the 2026-10-11 UI simplification.
const old=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/world-before-ui-simplification.json',import.meta.url),'utf8'));

test('a World saved before the UI simplification is refused as is and loads once converted', async () => {
  assert.throws(()=>readStorageSnapshot(old()),/Unsupported field: references/);
  const {snapshot,notes}=convertSnapshot(old());
  readStorageSnapshot(snapshot);
  await createConfiguratorAPI({load:async()=>snapshot,save:async()=>{},subscribe:()=>()=>{}});
  assert.equal(snapshot.rulesetFamilies[0].versions[0].status,'ready');
  const r=snapshot.rulesetFamilies[0].versions[0].workingDraft;
  assert.deepEqual(r.tests[0].outcomeRefs,['high','low']);
  assert.deepEqual(r.effects[0].targetRef,{objectKind:'definition',objectId:'str',capabilityId:'value',outputId:'value.base'});
  const sword=r.contentTemplates[0];
  assert.deepEqual(sword.relations.map(x=>[x.targetRef.objectId,x.config]),[['str',{initial:{'value.base':4}}],['hurt',{}]]);
  assert.deepEqual(sword.choiceGroups[0].options[0],{id:'o1',operation:'grant',targetRef:{objectKind:'definition',objectId:'fight'},config:{initial:{'value.base':1}}});
  assert.deepEqual(r.definitions[0].capabilities,['value']);
  assert.equal(r.permissionPolicies[0].enabled,false);
  assert.deepEqual(r.sectionColors,{organization:'#445566'});
  assert.ok(notes.some(note=>note.includes('Restriction')));
});

test('FormulaBindings copied per role become one binding without a role', () => {
  const source=old(),r=source.rulesetFamilies[0].versions[0].workingDraft;
  const target={objectKind:'definition',objectId:'str',capabilityId:'value',outputId:'value.final'};
  r.formulaBindings=[{id:'b-target',nameKey:'B',formulaRef:'f',targetRef:target,targetRole:'target'},{id:'b-self',nameKey:'B',formulaRef:'f',targetRef:target,targetRole:'self'}];
  const {snapshot,notes}=convertSnapshot(source);
  assert.deepEqual(snapshot.rulesetFamilies[0].versions[0].workingDraft.formulaBindings.map(b=>[b.id,Object.hasOwn(b,'targetRole')]),[['b-self',false]]);
  assert.ok(notes.some(note=>note.includes('b-target')));
});

test('Progression tracks are removed and the system keeps its name, ready for advancements and milestones', () => {
  const source=old(),r=source.rulesetFamilies[0].versions[0].workingDraft;
  r.progressionSystems=[{id:'p',nameKey:'Progress',descriptionKey:'',enabled:true,order:0,tags:[],tracks:[{id:'xp',name:'XP',mode:'threshold',thresholds:[5,10]}]}];
  const {snapshot,notes}=convertSnapshot(source);
  const [system]=snapshot.rulesetFamilies[0].versions[0].workingDraft.progressionSystems;
  assert.deepEqual([system.nameKey,Object.hasOwn(system,'tracks'),system.advancements,system.milestones],['Progress',false,[],[]]);
  assert.ok(notes.some(note=>note.includes('track')));
});

test('old sheet layouts become a LayoutNode tree that the module reads', async () => {
  const source=old(),record=source.rulesetFamilies[0].versions[0];
  for(const key of ['workingDraft','publishedSnapshot'])if(record[key])record[key].sheetDefinitions=[{id:'s',nameKey:'Sheet',descriptionKey:'',enabled:true,order:0,tags:[],viewType:'content',renderer:'foundry',layout:{direction:'grid',components:[
    {id:'head',kind:'section',label:'Identity',source:null,width:'full'},{id:'note',kind:'text',label:'Hello',source:null,width:'half'},{id:'hp',kind:'field',label:'HP',source:'x',width:'half'}]}}];
  const {snapshot,notes}=convertSnapshot(source);
  const [sheet]=snapshot.rulesetFamilies[0].versions[0].workingDraft.sheetDefinitions;
  assert.deepEqual([sheet.target,sheet.contentTypeIds,Object.hasOwn(sheet,'layout')],['item',[],false]);
  assert.deepEqual(sheet.root.children.map(n=>[n.kind,n.span??1]),[['section',2],['text',1]]);
  assert.ok(notes.some(note=>note.includes('field component hp')));
  readStorageSnapshot(snapshot);
  await createConfiguratorAPI({load:async()=>snapshot,save:async()=>{},subscribe:()=>()=>{}});
});
