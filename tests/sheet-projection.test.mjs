import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {RuntimeEngine} from '../src/runtime/runtime-engine.mjs';
import {projectSheet} from '../src/runtime/sheet-projection.mjs';
import {autoLayout,sheetActionIds} from '../src/configurator/sheet-auto-layout.mjs';
import {prepareLayout} from '../src/configurator/layout-contract.mjs';

class Storage{value=emptyStorageSnapshot();async load(){return structuredClone(this.value)}async save(v){this.value=structuredClone(v)}}
const hero={kind:'actor',id:'hero'};
const field=(id,valueType)=>({id,name:id,valueType,cardinality:'one',nullable:false,required:false,constraints:[]});
const out=(objectId,capabilityId,outputId,slotId)=>({objectKind:'definition',objectId,capabilityId,outputId,...(slotId?{slotId}:{})});

async function setup(){
  const api=await createConfiguratorAPI(new Storage());
  const v=(await api.createRuleset({id:'g',nameKey:'Game',version:'1'})).versionId;
  await api.registerDefinitionType(v,{id:'attribute',key:'attribute',nameKey:'Attributes',allowedCapabilities:['value'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'resource',key:'resource',nameKey:'Resources',allowedCapabilities:['pool'],defaultCapabilities:['pool'],requiredCapabilities:[],fields:{}});
  await api.registerDefinitionType(v,{id:'skill',key:'skill',nameKey:'Skills',allowedCapabilities:['value','state'],defaultCapabilities:['value'],requiredCapabilities:[],fields:{}});
  for(const id of ['str','dex'])await api.createDefinition(v,{id,key:id,definitionTypeId:'attribute',nameKey:id.toUpperCase(),data:{},capabilities:['value']});
  await api.createDefinition(v,{id:'hp',key:'hp',definitionTypeId:'resource',nameKey:'Health',data:{},capabilities:['pool'],slots:{pool:[{id:'points',name:'Points',minimum:{literal:0},maximum:{literal:12}}]}});
  for(const id of ['climb','swim','secret'])await api.createDefinition(v,{id,key:id,definitionTypeId:'skill',nameKey:id,data:{},capabilities:['value','state']});
  await api.createFormula(v,{id:'double-str',nameKey:'Twice STR',resultType:'number',expression:{type:'multiply',args:[{type:'literal',value:2},{type:'reference',reference:out('str','value','value.final')}]}});
  await api.createParameter(v,{id:'cap',nameKey:'Cap',valueType:'number',value:99});
  await api.createAction(v,{id:'rest',nameKey:'Rest',effectRefs:[]});
  await api.createPermissionPolicy(v,{id:'hidden',nameKey:'Hidden',scope:{objectKind:'definition',objectId:'secret'},defaultEffect:'DENY',rules:[]});
  await api.createContentType(v,{id:'weapon',nameKey:'Weapon',storageKind:'item',runtimeMode:'unique',fields:{damage:field('damage','string'),reach:field('reach','number')}});
  await api.createContentType(v,{id:'charm',nameKey:'Charm',storageKind:'item',runtimeMode:'unique',fields:{luck:field('luck','number')}});
  await api.createContentTemplate(v,{id:'sword',nameKey:'Sword',contentTypeId:'weapon',data:{damage:'1d8',reach:1},relations:[],choiceGroups:[]});
  await api.publishRuleset(v);
  const adapter=new MemoryRuntimeAdapter(),engine=new RuntimeEngine({configurator:api,adapter,hooks:null});
  await engine.initializeContainer(v,hero,{definitionIds:['str','dex','hp','climb','secret']});
  await engine.setDefinitionState(v,hero,'str',{base:7});
  await engine.setDefinitionState(v,hero,'climb',{base:40,active:true});
  await engine.setDefinitionState(v,hero,'hp',{pools:{points:9}});
  return {api,v,engine,adapter,ruleset:engine.ruleset(v)};
}
const find=(node,id)=>{if(!node)return null;if(node.id===id)return node;for(const child of [...(node.children??[]),...(node.rows??[]).flatMap(r=>r.children)]){const hit=find(child,id);if(hit)return hit;}return null;};

test('a sheet resolves outputs, Formulas and Parameters for one Actor', async()=>{
  const {v,engine}=await setup();
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'tabs',children:[{id:'main',kind:'tab',labelKey:'Main',children:[
    {id:'str',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},write:{operation:'set'}},
    {id:'hp',kind:'value',source:{kind:'output',reference:out('hp','pool','pool.current','points')},write:{operation:'subtract'}},
    {id:'twice',kind:'value',source:{kind:'formula',formulaRef:'double-str'},labelKey:'Double'},
    {id:'cap',kind:'value',source:{kind:'parameter',parameterRef:'cap'}},
    {id:'rest',kind:'action',actionRef:'rest'},{id:'note',kind:'text',textKey:'Hello'}]}]})};
  const view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.deepEqual([find(view.root,'str').value,find(view.root,'str').label,find(view.root,'str').write],[7,'STR',{operation:'set'}]);
  assert.deepEqual([find(view.root,'hp').value,find(view.root,'hp').minimum,find(view.root,'hp').maximum],[9,0,12]);
  assert.deepEqual([find(view.root,'twice').value,find(view.root,'twice').label,find(view.root,'twice').write],[14,'Double',null]);
  assert.equal(find(view.root,'cap').value,99);
  assert.equal(find(view.root,'rest').actionId,'rest');
  assert.equal(find(view.root,'main').label,'Main');
});

test('a repeater lists the held Definitions of a type; Permission hides what a user may not read or use', async()=>{
  const {v,engine,adapter}=await setup();
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'grid',columns:2,children:[
    {id:'skills',kind:'repeater',query:{definitionTypeId:'skill'},columns:2,children:[
      {id:'rank',kind:'value',source:{kind:'each',capabilityId:'value',outputId:'value.final'},write:{operation:'set'}},
      {id:'mark',kind:'value',source:{kind:'each',capabilityId:'state',outputId:'state.active'},write:{operation:'set'}},
      {id:'train',kind:'action',actionRef:'rest'}]}]})};
  const gm=await projectSheet(engine,v,sheet,{actor:hero});
  const skills=find(gm.root,'skills');
  assert.deepEqual(skills.rows.map(r=>r.definitionId),['climb','secret'],'swim is not held');
  const climb=skills.rows[0];
  assert.deepEqual(climb.children.map(c=>[c.id,c.value??c.actionId]),[['rank',40],['mark',true],['train','rest']]);
  assert.equal(climb.children[1].labelKey,'RTA.Sheet.Output.StateActive');
  assert.equal(climb.children[2].definitionId,'climb');
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','observer');adapter.currentUserId='p';
  const watcher=await projectSheet(engine,v,sheet,{actor:hero});
  const rows=find(watcher.root,'skills').rows;
  assert.deepEqual(rows.map(r=>r.definitionId),['climb'],'the secret skill is never sent');
  assert.deepEqual(rows[0].children.map(c=>[c.id,c.write]),[['rank',null],['mark',null]],'an observer reads, cannot write, and has no Actions');
  adapter.ownership.set('actor:hero|p','owner');
  const owner=await projectSheet(engine,v,sheet,{actor:hero});
  assert.deepEqual(find(owner.root,'skills').rows[0].children.map(c=>c.write?.operation??c.actionId),['set','set','rest']);
});

test('a value the engine cannot read keeps its place, with the reason', async()=>{
  const {v,engine}=await setup();
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'grid',children:[{id:'swim',kind:'value',source:{kind:'output',reference:out('swim','value','value.final')},write:{operation:'set'}}]})};
  const view=await projectSheet(engine,v,sheet,{actor:hero});
  assert.equal(view.root.children[0].value,null);assert.match(view.root.children[0].error,/not instantiated/);assert.equal(view.root.children[0].write,null);
});

test('an Item sheet shows the fields of its Content, owned or not', async()=>{
  const {v,engine,adapter}=await setup();
  const sheet={id:'w',target:'item',root:autoLayout(engine.ruleset(v),{target:'item',contentTypeIds:['weapon','charm']})};
  assert.deepEqual(sheet.root.children.map(n=>n.source.fieldId),['damage','reach','luck']);
  const loose=await projectSheet(engine,v,sheet,{content:{templateId:'sword'}});
  assert.deepEqual(loose.root.children.map(c=>[c.label,c.value,c.write]),[['damage','1d8',null],['reach',1,null]],'luck is a Charm field');
  const state=await adapter.load(hero,{rulesetVersionId:v});state.contents={'sword-1':{templateId:'sword',contentTypeId:'weapon',fields:{damage:'2d6'}}};
  await adapter.write(hero,{state,ledger:await adapter.loadLedger(hero)});
  const owned=await projectSheet(engine,v,sheet,{actor:hero,content:{key:'sword-1'}});
  assert.deepEqual(owned.root.children.map(c=>[c.value,c.write?.operation]),[['2d6','set'],[1,'set']]);
});

test('AUTO lays out every Definition Type with what its capabilities give, and the Actions a player starts', async()=>{
  const {v,engine,api}=await setup();
  const ruleset=engine.ruleset(v),root=autoLayout(ruleset);
  assert.deepEqual(root.children.map(n=>n.id),['type-attribute','type-resource','type-skill','contents','actions']);
  assert.deepEqual(root.children[2].children[0].children.map(n=>n.source.outputId),['value.final','state.active']);
  assert.deepEqual(sheetActionIds(ruleset),['rest']);
  const view=await projectSheet(engine,v,{id:'auto',target:'actor',root},{actor:hero});
  assert.deepEqual(find(view.root,'list-resource').rows[0].children.map(c=>[c.label,c.value,c.maximum]),[['Points',9,12]]);
  assert.deepEqual(find(view.root,'list-attribute').rows.map(r=>[r.label,r.children[0].value]),[['STR',7],['DEX',0]]);
  assert.equal((await api.createSheetDefinition(v,{id:'auto',nameKey:'Auto',target:'actor',root})).root.children.length,5);
});

test('a sheet keeps the objects it shows from being deleted', async()=>{
  const {api}=await setup();
  const v=(await api.createRuleset({id:'h',nameKey:'H',version:'1'})).versionId;
  await api.createFormula(v,{id:'f',nameKey:'F',resultType:'number',expression:{type:'literal',value:1}});
  await api.createSheetDefinition(v,{id:'s',nameKey:'S',target:'actor',root:{id:'root',kind:'grid',children:[{id:'f',kind:'value',source:{kind:'formula',formulaRef:'f'}}]}});
  await assert.rejects(api.deleteFormula(v,'f'),/still referenced/);
  await assert.rejects(api.createSheetDefinition(v,{id:'t',nameKey:'T',target:'actor',root:{id:'root',kind:'grid',children:[{id:'x',kind:'value',source:{kind:'field',fieldId:'damage'}}]}}),/Item sheets/);
});

test('a sheet writes only what its nodes allow, through the engine', async()=>{
  const {api,v,engine,adapter}=await setup();
  await api.createSheetDefinition(v,{id:'main',nameKey:'Main',target:'actor',root:{id:'root',kind:'grid',children:[
    {id:'str',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},write:{operation:'set'}},
    {id:'dex',kind:'value',source:{kind:'output',reference:out('dex','value','value.final')}},
    {id:'nudge',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},write:{operation:'adjust'}},
    {id:'hurt',kind:'value',source:{kind:'output',reference:out('hp','pool','pool.current','points')},write:{operation:'subtract'}},
    {id:'skills',kind:'repeater',query:{definitionTypeId:'skill'},children:[{id:'mark',kind:'value',source:{kind:'each',capabilityId:'state',outputId:'state.active'},write:{operation:'set'}}]}]}});
  await api.publishRuleset(v);
  const read=(id,capabilityId='value',outputId='value.final',slotId)=>engine.resolveReference(v,out(id,capabilityId,outputId,slotId),{roles:{self:hero},defaultRole:'self'});
  await engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'str',value:10});
  assert.equal(await read('str'),10);
  await engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'nudge',value:-3});
  assert.equal(await read('str'),7,'adjust lowers by a negative amount');
  await engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'nudge',value:2});
  assert.equal(await read('str'),9,'and raises by a positive one');
  await engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'hurt',value:20});
  assert.equal(await read('hp','pool','pool.current','points'),0,'the pool keeps its bounds');
  await engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'mark',definitionId:'secret',value:true});
  assert.equal(await read('secret','state','state.active'),true);
  await assert.rejects(engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'dex',value:3}),/does not let/);
  await assert.rejects(engine.writeSheetValue(v,hero,{sheetId:'main',nodeId:'mark',definitionId:'swim',value:true}),/not listed/);
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','observer');
  await assert.rejects(engine.forUser('p').writeSheetValue(v,hero,{sheetId:'main',nodeId:'str',value:1}),/Permission denied/);
  assert.equal((await adapter.loadLedger(hero)).length>=3,true,'each write is in the ledger');
});

test('setting a value.final moves its base by the difference, so Modifiers stay on top; AUTO sheets write too', async()=>{
  const {api,v,engine}=await setup();
  await api.createModifier(v,{id:'blessed',nameKey:'Blessed',targetRef:out('str','value','value.final'),operation:'add',valueSource:{kind:'literal',value:2},conditionRefs:[],stacking:{mode:'stack',group:''},priority:0});
  await api.publishRuleset(v);
  const ctx={roles:{self:hero},defaultRole:'self'};
  assert.equal(await engine.resolveReference(v,out('str','value','value.final'),ctx),9);
  await engine.writeSheetValue(v,hero,{sheetId:'auto',nodeId:'each-attribute-value',definitionId:'str',value:12});
  assert.deepEqual([await engine.resolveReference(v,out('str','value','value.base'),ctx),await engine.resolveReference(v,out('str','value','value.final'),ctx)],[10,12]);
});

test('a contents block lists the Contents an Actor holds, with their Items, and the other Items under the block that shows all', async()=>{
  const {api,v,engine}=await setup();
  await engine.acquire(v,hero,{content:{key:'item-1',templateId:'sword',contentTypeId:'weapon'}});
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'grid',children:[{id:'all',kind:'contents'},{id:'charms',kind:'contents',contentTypeIds:['charm']}]})};
  const items=[{id:'item-1',name:'My blade',img:'blade.webp',managed:true},{id:'item-2',name:'Rope',img:'',managed:false}];
  const view=await projectSheet(engine,v,sheet,{actor:hero,items});
  assert.deepEqual(find(view.root,'all').rows.map(r=>[r.key,r.label,r.img,r.type,r.item]),[['item-1','My blade','blade.webp','Weapon',true],['item-2','Rope','','',true]]);
  assert.deepEqual(find(view.root,'charms').rows,[]);
  assert.equal((await projectSheet(engine,v,sheet,{actor:null})).root.children.length,0,'no Actor, no contents');
  await assert.rejects(api.createSheetDefinition(v,{id:'i',nameKey:'I',target:'item',root:{id:'root',kind:'grid',children:[{id:'c',kind:'contents'}]}}),/only on Actor sheets/);
  await api.createSheetDefinition(v,{id:'a',nameKey:'A',target:'actor',root:{id:'root',kind:'grid',children:[{id:'c',kind:'contents',contentTypeIds:['charm']}]}});
  await assert.rejects(api.deleteContentType(v,'charm'),/still referenced/);
});

test('a value can show the Content an Actor holds of one type, by name (its Origin, its weapon)', async()=>{
  const {api,v,engine}=await setup();
  await engine.acquire(v,hero,{content:{key:'item-1',templateId:'sword',contentTypeId:'weapon'}});
  const sheet={id:'s',target:'actor',root:prepareLayout({id:'root',kind:'grid',children:[{id:'w',kind:'value',source:{kind:'content',contentTypeId:'weapon'}},{id:'c',kind:'value',source:{kind:'content',contentTypeId:'charm'}}]})};
  const view=await projectSheet(engine,v,sheet,{actor:hero,items:[{id:'item-1',name:'My blade',managed:true}]});
  assert.deepEqual([find(view.root,'w').label,find(view.root,'w').value],['Weapon','My blade']);
  assert.equal(find(view.root,'c').value,null,'nothing held of that type');
  await assert.rejects(api.createSheetDefinition(v,{id:'i',nameKey:'I',target:'item',root:{id:'root',kind:'grid',children:[{id:'w',kind:'value',source:{kind:'content',contentTypeId:'weapon'}}]}}),/only on Actor sheets/);
  await api.createSheetDefinition(v,{id:'a',nameKey:'A',target:'actor',root:{id:'root',kind:'grid',children:[{id:'w',kind:'value',source:{kind:'content',contentTypeId:'charm'}}]}});
  await assert.rejects(api.deleteContentType(v,'charm'),/still referenced/);
});

test('who sees what: the player gets the gauge, an observer its words, the GM the gauge and its − and +', async()=>{
  const {api,v,engine,adapter}=await setup();
  await api.createScale(v,{id:'health',nameKey:'Health',basis:'percent',rows:[{id:'a',labelKey:'Seems in great shape',min:100,max:null},{id:'b',labelKey:'Hurt',min:1,max:99.99},{id:'c',labelKey:'Down',min:null,max:0}]});
  await api.createScale(v,{id:'level',nameKey:'Level',basis:'value',rows:[{id:'a',labelKey:'Weak',min:null,max:5},{id:'b',labelKey:'Strong',min:6,max:null}]});
  await api.updateDefinitionType(v,'resource',{scaleRef:'health'});
  await api.updateDefinitionType(v,'attribute',{scaleRef:'level'});
  await api.updateDefinition(v,'dex',{scaleRef:'health'});
  const hp=out('hp','pool','pool.current','points');
  await api.createSheetDefinition(v,{id:'look',nameKey:'Look',target:'actor',root:{id:'root',kind:'grid',children:[
    {id:'gauge',kind:'value',source:{kind:'output',reference:hp},display:'gauge',seenBy:['player','gm'],write:{operation:'adjust',by:'gm'}},
    {id:'words',kind:'value',source:{kind:'output',reference:hp},display:'description',seenBy:['observer']},
    {id:'might',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},display:'description'}]}});
  await api.publishRuleset(v);
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','owner');
  adapter.users.set('o',{role:'player',isGM:false});adapter.ownership.set('actor:hero|o','observer');
  const sheet=api.getSheetDefinition(v,'look'),look=async who=>(await projectSheet(who?engine.forUser(who):engine,v,sheet,{actor:hero})).root.children;
  const gm=await look(),player=await look('p'),observer=await look('o');
  assert.deepEqual(gm.map(n=>[n.id,n.write?.operation??null]),[['gauge','adjust'],['might',null]],'the GM: the gauge with its − and +');
  assert.deepEqual(player.map(n=>[n.id,n.write?.operation??null,n.value]),[['gauge',null,9],['might',null,'Strong']],'the player: the gauge alone');
  assert.deepEqual(observer.map(n=>[n.id,n.value]),[['words','Hurt'],['might','Strong']],'an observer: words, never the number');
  assert.equal(['maximum','minimum'].some(key=>Object.hasOwn(observer[0],key)),false);
  await assert.rejects(engine.forUser('p').writeSheetValue(v,hero,{sheetId:'look',nodeId:'gauge',value:-1}),/Only a GM/);
  await assert.rejects(engine.forUser('o').writeSheetValue(v,hero,{sheetId:'look',nodeId:'gauge',value:-1}),/not on your sheet/);
  await engine.writeSheetValue(v,hero,{sheetId:'look',nodeId:'gauge',value:3});
  assert.equal((await look('o'))[0].value,'Seems in great shape','12/12');
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',seenBy:['gm'],children:[]}),/root is seen by all/);
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'x',kind:'text',textKey:'',seenBy:['owner']}]}),/seenBy must list/);
  assert.equal(prepareLayout({id:'root',kind:'grid',children:[{id:'x',kind:'text',textKey:'',seenBy:['gm','player','observer']}]}).children[0].seenBy,undefined,'everyone: nothing stored');
  assert.throws(()=>prepareLayout({id:'root',kind:'grid',children:[{id:'x',kind:'value',source:{kind:'formula',formulaRef:'f'},display:'description'}]}),/description/);
  await assert.rejects(api.createScale(v,{id:'bad',nameKey:'Bad',rows:[{id:'a',labelKey:'A',min:0,max:5},{id:'b',labelKey:'B',min:5,max:9}]}),/overlap/);
  await assert.rejects(api.deleteScale(v,'health'),/still referenced|REFERENTIAL|used/i);
});

test('a type-scoped Permission binds play writes, not character creation', async()=>{
  const {api,v,engine,adapter}=await setup();
  await api.createSheetDefinition(v,{id:'main',nameKey:'Main',target:'actor',root:{id:'root',kind:'grid',children:[
    {id:'str',kind:'value',source:{kind:'output',reference:out('str','value','value.final')},write:{operation:'set'}}]}});
  await api.createPermissionPolicy(v,{id:'gm-attributes',nameKey:'GM attributes',defaultEffect:'DENY',scope:{objectKind:'definitionType',objectId:'attribute'},
    rules:[{id:'read',effect:'ALLOW',operations:['read','execute'],priority:0}]});
  await api.publishRuleset(v);
  adapter.users.set('p',{role:'player',isGM:false});adapter.ownership.set('actor:hero|p','owner');
  const player=engine.forUser('p');
  await assert.rejects(player.writeSheetValue(v,hero,{sheetId:'main',nodeId:'str',value:3}),/Permission denied/);
  await engine.duringCreation(hero,()=>player.setDefinitionState(v,hero,'str',{base:3}));
  assert.equal(await engine.resolveReference(v,out('str','value','value.final'),{roles:{self:hero},defaultRole:'self'}),3);
  await assert.rejects(player.writeSheetValue(v,hero,{sheetId:'main',nodeId:'str',value:4}),/Permission denied/,'the exemption ends with the creation');
});
