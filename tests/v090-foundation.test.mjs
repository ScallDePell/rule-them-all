import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {FakeStorage} from './fake-storage.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';

async function setup(){const api=await createConfiguratorAPI(new FakeStorage());const r=await api.createRuleset({id:'r',nameKey:'R',version:'0.9.0'});const v=r.versionId;await api.registerDefinitionType(v,{id:'t',key:'t',nameKey:'Type',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});await api.createDefinition(v,{id:'x',key:'x',definitionTypeId:'t',nameKey:'X',capabilities:['value']});return {api,v};}
test('v0.9.0 creates gameplay foundations and a constrained SheetDefinition',async()=>{const {api,v}=await setup();
 await api.createModifier(v,{id:'m',nameKey:'Bonus',targetRef:{objectKind:'definition',objectId:'x',capabilityId:'value',outputId:'value.final'},operation:'add',valueSource:{kind:'literal',value:2},conditionRefs:[],stacking:{mode:'stack',group:''},priority:0});
 await api.createDuration(v,{id:'d',nameKey:'Round',mode:'fixed',amount:1,unit:'round'});
 await api.createCreationSystem(v,{id:'c',nameKey:'Create',steps:[{id:'s',name:'Choose',kind:'choice',options:[],min:0,max:1}]});
 await api.createProgressionSystem(v,{id:'p',nameKey:'Progress',milestones:[{id:'level-2',conditionRef:null,definitionIds:['x']}]});
 await assert.rejects(api.createProgressionSystem(v,{id:'old',nameKey:'Old',tracks:[]}),/tracks/);
 const sheet=await api.createSheetDefinition(v,{id:'sheet',nameKey:'Character',viewType:'actor',renderer:'foundry',layout:{direction:'column',components:[{id:'head',kind:'section',label:'Identity',source:null,width:'full'}]}});
 assert.equal(sheet.layout.components[0].kind,'section');assert.equal(api.listModifiers(v).length,1);assert.equal(api.listCreationSystems(v).length,1);
});
test('v0.9.0 runtime resolves modifier stacking; restrictions are Permission rules',async()=>{const {api,v}=await setup();
 await api.createModifier(v,{id:'m1',nameKey:'A',targetRef:{objectKind:'definition',objectId:'x'},operation:'add',valueSource:{kind:'literal',value:2},conditionRefs:[],stacking:{mode:'highest',group:'gear'},priority:0});
 await api.createModifier(v,{id:'m2',nameKey:'B',targetRef:{objectKind:'definition',objectId:'x'},operation:'add',valueSource:{kind:'literal',value:3},conditionRefs:[],stacking:{mode:'highest',group:'gear'},priority:0});
 await api.publishRuleset(v);const engine=new RuntimeEngine({configurator:api,adapter:new MemoryRuntimeAdapter()});const resolved=await engine.resolveModifiers(v,{objectKind:'definition',objectId:'x'},10,{});assert.equal(resolved.value,13);assert.deepEqual(resolved.applied,['m2']);assert.equal(engine.checkRestrictions,undefined);
});
test('v0.9.0 WYSIWYG UI is constrained and has no arbitrary code editor',async()=>{const fs=await import('node:fs/promises');const h=await fs.readFile(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');assert.match(h,/RTA\.Template\.WysiwygLayout/);assert.match(h,/data-action="addSheetComponent"/);assert.doesNotMatch(h,/name="sheetHtml"|name="sheetCss"|name="sheetJs"/);});
