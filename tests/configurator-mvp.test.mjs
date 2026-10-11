import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
class MemoryStorage{constructor(){this.value=emptyStorageSnapshot();this.listeners=new Set();}async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v);for(const f of this.listeners)f(this.value)}subscribe(f){this.listeners.add(f);return()=>this.listeners.delete(f)}}
const base=()=>({id:'rta-demo',nameKey:'RWF Demo',version:'1.0.0'});

test('Configurator MVP supports Parameter Formula Condition Effect Action chain',async()=>{
 const api=await createConfiguratorAPI(new MemoryStorage()); const v=(await api.createRuleset(base())).versionId;
 await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Caractéristique',descriptionKey:'',color:'#808080',enabled:true,order:10,allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{score:{id:'score',name:'Score',valueType:'integer',cardinality:'one',required:true,nullable:false,defaultValue:1,constraints:[{kind:'min',value:0},{kind:'max',value:5},{kind:'step',value:1}],editable:true}},constraints:[]});
 await api.createDefinition(v,{id:'strength',key:'strength',definitionTypeId:'attribute',nameKey:'Force',descriptionKey:'',data:{score:3},categories:[],enabled:true,order:10,tags:[]});
 await api.createParameter(v,{id:'vitality-base',nameKey:'Vitalité de base',valueType:'integer',nullable:false,value:7,scope:'ruleset',enabled:true,order:10,tags:[]});
 await api.createFormula(v,{id:'vitality-max',nameKey:'Vitalité max',resultType:'number',expression:{type:'add',args:[{type:'parameter',id:'vitality-base'},{type:'reference',reference:{objectKind:'definition',objectId:'strength',outputId:'value.final'}}]},enabled:true,order:10,tags:[]});
 await api.createCondition(v,{id:'alive',nameKey:'Encore debout',expression:{type:'gt',left:{type:'reference',reference:{objectKind:'definition',objectId:'strength',outputId:'value.final'}},right:{type:'literal',value:0}},enabled:true,order:10,tags:[]});
 await api.createEffect(v,{id:'damage',nameKey:'Dégâts',targetRef:{objectKind:'definition',objectId:'strength',outputId:'value.base'},operation:'subtract',operand:{kind:'literal',value:1},enabled:true,order:10,tags:[]});
 await api.createAction(v,{id:'hurt',nameKey:'Blessure légère',conditionRefs:['alive'],costEffectRefs:[],effectRefs:['damage'],enabled:true,order:10,tags:[]});
 const deps=api.listDependencies(v);
 assert.ok(deps.some(d=>d.targetRef.objectKind==='parameter'&&d.targetRef.objectId==='vitality-base'));
 assert.ok(deps.some(d=>d.targetRef.objectKind==='condition'&&d.targetRef.objectId==='alive'));
 await assert.rejects(()=>api.deleteCondition(v,'alive'),/still referenced/i);
 assert.equal(api.getAction(v,'hurt').effectRefs[0],'damage');
});

test('Configurator MVP supports Permission Event Trigger and ContentTemplate contracts',async()=>{
 const api=await createConfiguratorAPI(new MemoryStorage()); const v=(await api.createRuleset(base())).versionId;
 await api.createPermissionPolicy(v,{id:'owner-read',nameKey:'Owner read',scope:{objectKind:'definition'},rules:[{id:'owner',operations:['read'],effect:'ALLOW',subjects:{ownershipLevels:['OWNER']},priority:10}],defaultEffect:'DENY',enabled:true,order:10});
 await api.createEventType(v,{id:'damage-applied',nameKey:'Damage applied',payloadFields:{amount:{valueType:'number'}},roles:['source','target'],enabled:true,order:10});
 await api.createCondition(v,{id:'always',nameKey:'Always',expression:{type:'literal',value:true},enabled:true,order:10,tags:[]});
 await api.createAction(v,{id:'noop',nameKey:'Noop',conditionRefs:[],costEffectRefs:[],effectRefs:[],enabled:true,order:10,tags:[]});
 await api.createTrigger(v,{id:'damage-trigger',nameKey:'Damage trigger',eventTypeId:'damage-applied',eventFilter:null,conditionRefs:['always'],actionRefs:['noop'],enabled:true,order:10,tags:[]});
 await api.createContentType(v,{id:'item',nameKey:'Item',descriptionKey:'',storageKind:'item',runtimeMode:'unique',enabled:true,order:10,tags:[]});
 await api.createContentTemplate(v,{id:'demo-template',nameKey:'Demo',contentTypeId:'item',runtimeMode:'unique',definitionBindings:[],actionBindings:[{id:'use',actionId:'noop'}],initialStateRules:[],categories:[],capabilities:[],enabled:true,order:10,tags:[]});
 assert.ok(api.listDependencies(v).some(d=>d.targetRef.objectKind==='eventType'&&d.targetRef.objectId==='damage-applied'));
 await assert.rejects(()=>api.deleteAction(v,'noop'),/still referenced/i);
});


test('Content Types are first-class and protect referenced templates',async()=>{
 const api=await createConfiguratorAPI(new MemoryStorage()); const v=(await api.createRuleset(base())).versionId;
 await api.createContentType(v,{id:'profession',nameKey:'Métier',descriptionKey:'',storageKind:'item',runtimeMode:'unique',enabled:true,order:10,tags:[]});
 await api.createContentTemplate(v,{id:'doctor',nameKey:'Médecin',descriptionKey:'',contentTypeId:'profession',runtimeMode:'unique',definitionBindings:[],actionBindings:[],initialStateRules:[],categories:[],capabilities:[],enabled:true,order:10,tags:[]});
 assert.equal(api.getContentType(v,'profession').storageKind,'item');
 assert.ok(api.listDependencies(v).some(d=>d.targetRef.objectKind==='contentType'&&d.targetRef.objectId==='profession'));
 await assert.rejects(()=>api.deleteContentType(v,'profession'),/still referenced/i);
 await api.deleteContentTemplate(v,'doctor');
 assert.equal(await api.deleteContentType(v,'profession'),true);
});


test('Content Type Fields validate template data and referenced rules are dependency-protected',async()=>{
 const api=await createConfiguratorAPI(new MemoryStorage()); const v=(await api.createRuleset(base())).versionId;
 await api.createRoll(v,{id:'damage-roll',nameKey:'Dégâts 9mm',formula:'1d8',data:{},enabled:true,order:10,tags:[]});
 await api.createContentType(v,{id:'weapon',nameKey:'Arme',descriptionKey:'',image:'icons/svg/sword.svg',color:'#884433',storageKind:'item',runtimeMode:'unique',fields:{damage:{id:'damage',name:'Dégâts',valueType:'reference',cardinality:'one',required:true,nullable:false,editable:true,referenceTarget:{objectKind:'roll'}},range:{id:'range',name:'Portée',valueType:'number',cardinality:'one',required:false,nullable:false,defaultValue:0,constraints:[{kind:'min',value:0}],editable:true}},enabled:true,order:10,tags:[]});
 await api.createContentTemplate(v,{id:'pistol',nameKey:'Pistolet',descriptionKey:'',image:'icons/svg/item-bag.svg',contentTypeId:'weapon',runtimeMode:'unique',data:{damage:{objectKind:'roll',objectId:'damage-roll'},range:25},definitionBindings:[],actionBindings:[],initialStateRules:[],categories:[],capabilities:[],enabled:true,order:10,tags:[]});
 assert.equal(api.getContentTemplate(v,'pistol').data.range,25);
 assert.equal(api.getContentType(v,'weapon').color,'#884433');
 assert.ok(api.listDependencies(v).some(d=>d.kind==='contentFieldReference'&&d.targetRef.objectId==='damage-roll'));
 await assert.rejects(()=>api.deleteRoll(v,'damage-roll'),/still referenced/i);
 await assert.rejects(()=>api.createContentTemplate(v,{id:'bad',nameKey:'Bad',contentTypeId:'weapon',runtimeMode:'unique',data:{range:-1},definitionBindings:[],actionBindings:[],initialStateRules:[],categories:[],capabilities:[],enabled:true,order:20,tags:[]}),/Required field is missing|greater than or equal/i);
});

test('Removing a Content Type field prunes stored values from templates of that type',async()=>{
 const api=await createConfiguratorAPI(new MemoryStorage()); const v=(await api.createRuleset(base())).versionId;
 await api.createContentType(v,{id:'gear',nameKey:'Équipement',storageKind:'item',runtimeMode:'unique',fields:{weight:{id:'weight',name:'Poids',valueType:'number',cardinality:'one',required:false,nullable:false,defaultValue:1,editable:true}},enabled:true,order:10,tags:[]});
 await api.createContentTemplate(v,{id:'bag',nameKey:'Sac',contentTypeId:'gear',runtimeMode:'unique',data:{weight:2},definitionBindings:[],actionBindings:[],initialStateRules:[],categories:[],capabilities:[],enabled:true,order:10,tags:[]});
 const type=api.getContentType(v,'gear');
 await api.updateContentType(v,'gear',{...type,fields:{}});
 assert.deepEqual(api.getContentTemplate(v,'bag').data,{});
});
