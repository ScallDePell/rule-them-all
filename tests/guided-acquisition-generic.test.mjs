import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundryContentBridge} from '../src/runtime/foundry-content-bridge.mjs';
import {acquisitionChoiceCatalog} from '../src/runtime/guided-acquisition.mjs';
import {guardOwnedContentCreation} from '../src/runtime/foundry-content-hooks.mjs';
import {prepareContentTemplate} from '../src/configurator/rule-contracts.mjs';

const ref=(id,operation,objectKind,objectId,config={})=>({id,operation,targetRef:{objectKind,objectId},config});
function setup(){
  const template={id:'selection',nameKey:'Source',contentTypeId:'type',enabled:true,runtimeMode:'stackable',
    relations:[ref('link','link','action','act')],
    choiceGroups:[{id:'pick',name:'Make a choice',min:2,max:2,options:[
      ref('definition-option','grant','definition','def',{initial:{'value.base':0}}),
      ref('tag-option','grant','tag','tag'),
      ref('unlock-option','unlock','contentTemplate','other'),
      ref('association-option','link','action','act')
    ]}],definitionBindings:[],actionBindings:[]};
  const ruleset={contentTypes:[{id:'type',enabled:true,storageKind:'item'}],contentTemplates:[template,{id:'other',enabled:true}],
    definitions:[{id:'def',enabled:true}],actions:[{id:'act',enabled:true}],tags:[{id:'tag',enabled:true}],familyColors:{}};
  const flags={},created=[],removed=[],instantiated=[];
  const actor={uuid:'Actor.guided',documentName:'Actor',getFlag:(_s,k)=>flags[k],
    async setFlag(_s,k,v){flags[k]=structuredClone(v);},
    async createEmbeddedDocuments(kind,data){
      assert.equal(kind,'Item');created.push(structuredClone(data[0]));
      const item={id:`item-${created.length}`,parent:actor,documentName:'Item',getFlag:(_s,k)=>data[0].flags['rule-them-all'][k],
        async delete(){removed.push(this.id);}};
      return [item];
    }};
  const runtime={adapter:{resolveDocument:async()=>actor,canWrite:async()=>true},
    getContainerState:async()=>({rulesetVersionId:'v',definitionStates:{}}),
    instantiateDefinition:async(_v,_actor,id,{initial})=>instantiated.push({id,initial}),
    removeDefinitionState:async()=>{}};
  const api={getRulesetVersion:()=>({workingDraft:ruleset})};
  const bridge=new FoundryContentBridge(api,runtime,{hooks:null,documentTypeResolver:()=> 'equipment'});
  return {bridge,ruleset,template,actor,flags,created,removed,instantiated};
}
const owned=(actor,flag)=>({parent:actor,getFlag:(_s,k)=>k==='contentTemplate'?flag:null});

test('preCreateItem cancels raw Content insertion and routes a choice-enabled template to guided flow',()=>{
  const {bridge,actor}=setup(),request=[];
  const result=guardOwnedContentCreation(owned(actor,{managed:true,versionId:'v',templateId:'selection'}),'user','user',bridge,
    {requestGuided:input=>request.push(input)});
  assert.equal(result,false);
  assert.deepEqual(request,[{versionId:'v',actorRef:actor.uuid,templateId:'selection',sourceData:null}]);
  assert.equal(guardOwnedContentCreation(owned(actor,{managed:true,versionId:'v',templateId:'selection'}),'remote','user',bridge),undefined);
  assert.equal(guardOwnedContentCreation(owned(actor,{managed:false}),'user','user',bridge),undefined);
});

test('preCreateItem validates answers of several families, blocking a forged or invalid selection',()=>{
  const {bridge,actor}=setup(),errors=[];
  const flag={managed:true,versionId:'v',templateId:'selection',acquisitionSelections:{pick:['definition-option','tag-option']}};
  assert.equal(guardOwnedContentCreation(owned(actor,flag),'user','user',bridge),undefined);
  flag.acquisitionSelections={pick:['definition-option']};
  assert.equal(guardOwnedContentCreation(owned(actor,flag),'user','user',bridge,{onError:e=>errors.push(e)}),false);
  assert.match(errors[0].message,/requires 2 selection/);
  flag.acquisitionSelections={pick:['definition-option','nonexistent']};
  assert.equal(guardOwnedContentCreation(owned(actor,flag),'user','user',bridge,{onError:e=>errors.push(e)}),false);
  assert.match(errors[1].message,/Invalid acquisition choice option/);
});

test('guided acquisition: validate before Item creation, cancel without writes, then acquire mixed-family permissions',async()=>{
  const {bridge,ruleset,template,actor,flags,created,instantiated}=setup();
  const catalog=acquisitionChoiceCatalog(ruleset,template);
  assert.deepEqual(catalog[0].options.map(x=>x.objectKind),['definition','tag','contentTemplate','action']);
  assert.equal(await bridge.createOwnedContentItem('v',actor.uuid,'selection',{prompt:async()=>null}),null);
  assert.equal(created.length,0);
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{selections:{pick:['tag-option']}}),/requires 2/);
  assert.equal(created.length,0);
  const result=await bridge.createOwnedContentItem('v',actor.uuid,'selection',
    {selections:{pick:['definition-option','tag-option']}});
  assert.equal(result.item.id,'item-1');
  assert.deepEqual(instantiated,[{id:'def',initial:{'value.base':0}}]);
  assert.equal(created[0].flags['rule-them-all'].contentTemplate.acquisitionSelections.pick.length,2);
  assert.deepEqual(flags.contentAcquisitions['item-1'].grantedRefs,[{objectKind:'definition',objectId:'def'},{objectKind:'tag',objectId:'tag'}]);
  assert.deepEqual(await bridge.listLinkedReferences('v',actor.uuid),[{objectKind:'action',objectId:'act'}]);
  assert.equal(await bridge.hasGrantedReference('v',actor.uuid,{objectKind:'tag',objectId:'tag'}),true);
  await bridge.releaseAcquisition(actor.uuid,'item-1');
  assert.equal(await bridge.hasGrantedReference('v',actor.uuid,{objectKind:'tag',objectId:'tag'}),false);
});

test('two concurrent Content item hook acquisitions are serialized (no duplicate Definition side effects)',async()=>{
  const {bridge,actor,instantiated,flags}=setup();
  const flag={managed:true,versionId:'v',templateId:'selection',acquisitionSelections:{pick:['definition-option','tag-option']}};
  const item={id:'item-1',parent:actor,getFlag:(_s,k)=>k==='contentTemplate'?flag:null};
  const [a,b]=await Promise.all([bridge.handleOwnedItemCreated(item),bridge.handleOwnedItemCreated(item)]);
  assert.equal(instantiated.length,1);
  assert.equal(Boolean(a.alreadyApplied||b.alreadyApplied),true);
  assert.equal(Object.keys(flags.contentAcquisitions).length,1);
});

test('multiple distinct acquisitions of the same Actor do not erase each other while saving flags',async()=>{
  const {bridge,actor,flags}=setup();
  await Promise.all([
    bridge.acquireTemplate('v',actor.uuid,'selection',{sourceItemId:'first',selections:{pick:['tag-option','unlock-option']}}),
    bridge.acquireTemplate('v',actor.uuid,'selection',{sourceItemId:'second',selections:{pick:['definition-option','association-option']}})
  ]);
  assert.deepEqual(Object.keys(flags.contentAcquisitions).sort(),['first','second']);
  assert.equal(await bridge.hasGrantedReference('v',actor.uuid,{objectKind:'tag',objectId:'tag'}),true);
  assert.deepEqual(await bridge.listUnlockedReferences('v',actor.uuid),[{objectKind:'contentTemplate',objectId:'other'}]);
  await bridge.releaseAcquisition(actor.uuid,'first');
  assert.equal(await bridge.hasGrantedReference('v',actor.uuid,{objectKind:'tag',objectId:'tag'}),false);
  assert.ok(flags.contentAcquisitions.second);
});

test('duplicate generic choice group and option identities cannot enter a Ruleset',()=>{
  const seed={id:'source',nameKey:'Source',contentTypeId:'type'};
  const group={id:'one',name:'One',min:1,max:1,options:[ref('a','grant','tag','tag')]};
  assert.throws(()=>prepareContentTemplate({...seed,choiceGroups:[group,{...group}]}),/Duplicate acquisition group/);
  assert.throws(()=>prepareContentTemplate({...seed,choiceGroups:[{...group,options:[group.options[0],group.options[0]],max:2}]}),/Duplicate acquisition option/);
});


test('guided native drop preserves opaque Item instance data, external flags and exact Rule Them All provenance',async()=>{
  const {bridge,actor,created}=setup();
  const incoming={_id:'copied-id',name:'Customized instance',type:'equipment',img:'user-image.png',
    system:{custom:{value:12}},flags:{'third-party':{notes:'retained'},'rule-them-all':{customFlag:'retain'}}};
  await bridge.createOwnedContentItem('v',actor.uuid,'selection',{
    selections:{pick:['tag-option','unlock-option']},sourceData:incoming
  });
  assert.equal(created.length,1);
  assert.equal(created[0]._id,undefined);
  assert.equal(created[0].name,'Customized instance');
  assert.deepEqual(created[0].system,{custom:{value:12}});
  assert.deepEqual(created[0].flags['third-party'],{notes:'retained'});
  assert.equal(created[0].flags['rule-them-all'].customFlag,'retain');
  assert.deepEqual(created[0].flags['rule-them-all'].contentTemplate.acquisitionSelections.pick,['tag-option','unlock-option']);
  assert.equal(incoming._id,'copied-id','original item input cannot be mutated');
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{
    selections:{pick:['tag-option','unlock-option']},sourceData:{...incoming,type:'unknown'}
  }),/subtype changed/);
  assert.equal(created.length,1);
});

test('unique template cannot leave a second orphaned owned Item before an acquisition',async()=>{
  const {bridge,actor,flags}=setup();
  const template=bridge.getAcquisitionTemplate('v','selection');template.runtimeMode='unique';
  flags.contentAcquisitions={one:{versionId:'v',templateId:'selection'}};
  const errors=[],flag={managed:true,versionId:'v',templateId:'selection',acquisitionSelections:{pick:['tag-option','unlock-option']}};
  assert.equal(guardOwnedContentCreation(owned(actor,flag),'player','player',bridge,{onError:e=>errors.push(e)}),false);
  assert.match(errors[0].message,/already has the unique/);
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{selections:flag.acquisitionSelections}),/already has the unique/);
});

test('invalid initial-state collision across a legacy binding and typed grant is rejected before writing',async()=>{
  const {bridge,actor,created,template}=setup();
  template.definitionBindings=[{definitionId:'def',initial:{'value.base':8}}];
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{
    selections:{pick:['definition-option','tag-option']}
  }),/Conflicting initial Definition states/);
  assert.equal(created.length,0);
});

test('native drag without choice groups is also routed through the transaction to avoid an unacquired Item',async()=>{
  const {bridge,actor,created,template}=setup();template.choiceGroups=[];
  const requests=[];
  assert.equal(guardOwnedContentCreation(owned(actor,{managed:true,versionId:'v',templateId:'selection'}),'user','user',bridge,
    {requestGuided:request=>requests.push(request)}),false);
  assert.equal(created.length,0);
  assert.equal(requests.length,1);
  const result=await bridge.createOwnedContentItem('v',actor.uuid,'selection');
  assert.equal(result.item.id,'item-1');
  assert.equal(created.length,1);
});

test('historical initial-state values remain available when a Definition binding specifies no override',async()=>{
  const {bridge,actor,template,instantiated}=setup();
  template.choiceGroups=[];
  template.definitionBindings=[{definitionId:'def',initial:{}}];
  template.initialStateRules=[{id:'legacy',definitionId:'def',initial:{'value.base':4}}];
  await bridge.createOwnedContentItem('v',actor.uuid,'selection');
  assert.deepEqual(instantiated,[{id:'def',initial:{'value.base':4}}]);
});

test('disabled executable target is detected before any Foundry Item is created',async()=>{
  const {bridge,actor,created,ruleset,template}=setup();
  template.relations.push(ref('grant-action','grant','action','act'));
  ruleset.actions[0].enabled=false;
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{
    selections:{pick:['tag-option','unlock-option']}
  }),/Acquisition Action unavailable/);
  assert.equal(created.length,0);
});

test('simultaneous unique Item requests cannot create a second, unacquired copy',async()=>{
  const {bridge,actor,created,template}=setup();
  template.runtimeMode='unique';
  const results=await Promise.allSettled([
    bridge.createOwnedContentItem('v',actor.uuid,'selection',{selections:{pick:['tag-option','unlock-option']}}),
    bridge.createOwnedContentItem('v',actor.uuid,'selection',{selections:{pick:['definition-option','association-option']}})
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.equal(created.length,1);
});

test('Runtime failure removes only the newly created Item and never changes the preexisting Actor',async()=>{
  const {bridge,actor,created,removed,flags}=setup();
  bridge.runtime.instantiateDefinition=async()=>{throw Error('Runtime unavailable');};
  await assert.rejects(bridge.createOwnedContentItem('v',actor.uuid,'selection',{
    selections:{pick:['definition-option','tag-option']}
  }),/Runtime unavailable/);
  assert.equal(created.length,1);
  assert.deepEqual(removed,['item-1']);
  assert.deepEqual(flags.contentAcquisitions??{},{});
});
