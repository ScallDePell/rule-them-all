/** Receives actual HBS/RTA Select form data on stdin and persists with RTA API. */
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const form=JSON.parse(input);
class Storage{snapshot=emptyStorageSnapshot();async load(){return structuredClone(this.snapshot)}async save(data){this.snapshot=structuredClone(data)}}
const storage=new Storage();let api=await createConfiguratorAPI(storage);
const v=(await api.createRuleset({id:'browser-real-form',nameKey:'Browser Real Form',version:'1.0.0'})).versionId;
await api.registerDefinitionType(v,{id:'definition-type',key:'definition-type',nameKey:'Type',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
await api.createDefinition(v,{id:'definition-1',key:'definition-1',nameKey:'Definition One',definitionTypeId:'definition-type',capabilities:['value'],data:{}});
await api.createAction(v,{id:'action-1',nameKey:'Action One',conditionRefs:[],costEffectRefs:[],effectRefs:[]});
await api.createContentType(v,{id:'content-type',nameKey:'Type de contenu',storageKind:'item',runtimeMode:'unique'});
await api.createContentTemplate(v,{id:'linked',nameKey:'Linked',contentTypeId:'content-type'});
await api.createContentTemplate(v,form);
api=await createConfiguratorAPI(storage);
const loaded=api.getContentTemplate(v,form.id);
assert.deepEqual(loaded.relations,form.relations);
assert.deepEqual(loaded.choiceGroups,form.choiceGroups);
const status=api.getDeletionStatus(v,'linked','contentTemplate');
assert.equal(status.canDelete,false);
await assert.rejects(()=>api.deleteContentTemplate(v,'linked'),/referenced/i);
console.log(JSON.stringify({result:'PASS',content:loaded.id,relations:loaded.relations.length,choices:loaded.choiceGroups[0].options.length,reloaded:true,integrityProtected:true}));
