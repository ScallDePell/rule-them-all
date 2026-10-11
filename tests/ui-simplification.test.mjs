import test from 'node:test';
import assert from 'node:assert/strict';
import {collectEntryData} from '../src/configurator/entry-data-collector.mjs';
import {prepareEffect} from '../src/configurator/rule-contracts.mjs';

/** A form holding only the given values; every checkbox list is empty unless listed. */
function form(values={},checked={}){
  return {fd:{get:key=>Object.hasOwn(values,key)?values[key]:null},bool:key=>values[key]===true,checkedIds:name=>checked[name]??[],
    queryOne:()=>null,queryAll:()=>[],uid:prefix=>`${prefix}-1`,fieldUid:()=>'field-1'};
}

test('saving an Outcome keeps its label key, which the form does not show', () => {
  const current={id:'hit',nameKey:'Hit',labelKey:'RULES.Hit',resultKey:'hit',conditionRef:null,tags:[]};
  const saved=collectEntryData('outcome',{...form({nameKey:'Hit',resultKey:'hit'}),current});
  assert.equal(saved.labelKey,'RULES.Hit');
});

test('saving a Sheet keeps its tags', () => {
  const current={id:'sheet',nameKey:'Sheet',tags:['main'],layout:{direction:'column',components:[]}};
  assert.deepEqual(collectEntryData('sheetDefinition',{...form({nameKey:'Sheet'}),current}).tags,['main']);
});

test('a Content Template saves the categories chosen in its picker and no longer writes capabilities', () => {
  const current={id:'rope',nameKey:'Rope',contentTypeId:'gear',categories:['old'],capabilities:['value'],tags:[]};
  const saved=collectEntryData('contentTemplate',{...form({nameKey:'Rope',contentTypeId:'gear',runtimeMode:'unique'},{categories:['tools']}),current});
  assert.deepEqual(saved.categories,['tools']);
  assert.deepEqual(saved.capabilities,['value']);
});

test('an Effect can act on the acting container, which lets the UI build a cost', () => {
  const ref='{"objectKind":"definition","objectId":"mana","capabilityId":"pool","outputId":"pool.current","slotId":"mp"}';
  const saved=collectEntryData('effect',{...form({nameKey:'Pay',targetRef:ref,targetRole:'self',operation:'subtract',operandKind:'literal',operandLiteral:'2'}),current:{id:'pay'}});
  assert.equal(saved.targetRole,'self');
  const effect={id:'e',nameKey:'E',targetRef:JSON.parse(ref)};
  assert.equal(prepareEffect(effect).targetRole,'target');
  assert.throws(()=>prepareEffect({...effect,targetRole:'not a role'}),/targetRole/);
});

test('rule editors show the description only once, inside the folded Notes section', async () => {
  const {readFileSync}=await import('node:fs');
  const hbs=readFileSync(new URL('../templates/configurator/entry-editor.hbs',import.meta.url),'utf8');
  const rules=hbs.slice(hbs.indexOf('{{#if isParameter}}'),hbs.indexOf('{{#if isPermissionPolicy}}'));
  assert.doesNotMatch(rules,/rtaIdentityDescription/);
  assert.equal(rules.match(/{{> rtaNotesSection}}/g).length,9);
});

test('a Definition type sets each capability with one role select', async () => {
  const {capabilityTypeRegistry,capabilityRole}=await import('../src/configurator/capability-type-registry.mjs');
  const capabilityTypes=capabilityTypeRegistry.list();
  assert.deepEqual(capabilityTypes.map(cap=>cap.id),['value','pool','collection','state']);
  const values={nameKey:'Skill','capability:value':'required','capability:pool':'default','capability:collection':'optional','capability:state':'off'};
  const saved=collectEntryData('definitionType',{...form(values),capabilityTypes,current:{id:'skill'}});
  assert.deepEqual(saved.allowedCapabilities,['value','pool','collection']);
  assert.deepEqual(saved.defaultCapabilities,['pool']);
  assert.deepEqual(saved.requiredCapabilities,['value']);
  assert.deepEqual(['value','pool','collection','state'].map(id=>capabilityRole(saved,id)),['required','default','optional','off']);
});

test('a Content Template description becomes the Item description where the Game System has one', async () => {
  const {descriptionPath}=await import('../src/core/system-document-types.mjs');
  const {FoundryContentBridge}=await import('../src/runtime/foundry-content-bridge.mjs');
  const config=fields=>({Item:{dataModels:{gear:{schema:{fields}}}}});
  assert.equal(descriptionPath('Item','gear',{config:config({description:{}})}),'system.description');
  assert.equal(descriptionPath('Item','gear',{config:config({description:{fields:{value:{}}}})}),'system.description.value');
  assert.equal(descriptionPath('Item','gear',{config:config({}),model:{}}),null);
  assert.equal(descriptionPath('Item','gear',{config:{},model:{Item:{gear:{description:{value:''}}}}}),'system.description.value');
  const bridge=new FoundryContentBridge({},{},{hooks:null,documentTypeResolver:()=>'gear',descriptionPath:()=>'system.description.value'});
  const data=bridge.documentData('v1',{id:'rope',nameKey:'Rope',descriptionKey:'Fifteen metres.'},{id:'gear',storageKind:'item',runtimeMode:'unique'});
  assert.equal(data.system.description.value,'Fifteen metres.');
  const none=new FoundryContentBridge({},{},{hooks:null,documentTypeResolver:()=>'gear',descriptionPath:()=>null});
  assert.equal(none.documentData('v1',{id:'rope',nameKey:'Rope',descriptionKey:'x'},{id:'gear',storageKind:'item'}).system,undefined);
});

test('a Test keeps its Outcomes in the dragged order and an Outcome has no priority', async () => {
  const {prepareOutcome}=await import('../src/configurator/rule-contracts.mjs');
  assert.throws(()=>prepareOutcome({id:'o',nameKey:'O',resultKey:'o',priority:3}),/priority/);
  const rows=['great','plain'].map(id=>({dataset:{orderedItem:id}}));
  const list={querySelectorAll:selector=>selector==='[data-ordered-item]:not([hidden])'?rows:[]};
  const saved=collectEntryData('test',{...form({nameKey:'Check'}),queryOne:selector=>selector==='[data-ordered-list="outcomeRefs"]'?list:null,current:{id:'check'}});
  assert.deepEqual(saved.outcomeRefs,['great','plain']);
});

test('Modifier and Duration editors save plain fields instead of JSON', async () => {
  const {refToken}=await import('../src/configurator/reference-token.mjs');
  const ref=refToken({objectKind:'definition',objectId:'vigor',capabilityId:'value',outputId:'value.final'});
  const modifier=collectEntryData('modifier',{...form({nameKey:'Blessed',targetRef:ref,operation:'max',operandKind:'literal',operandLiteral:'3',stackingMode:'highest',stackingGroup:'blessing',priority:'2',enabled:true},{conditionRefs:['ready']}),current:{id:'m'}});
  assert.deepEqual({op:modifier.operation,source:modifier.valueSource,stacking:modifier.stacking,priority:modifier.priority,conditions:modifier.conditionRefs},
    {op:'max',source:{kind:'literal',value:3},stacking:{mode:'highest',group:'blessing'},priority:2,conditions:['ready']});
  assert.equal(modifier.targetRef.capabilityId,'value');
  const fixed=collectEntryData('duration',{...form({nameKey:'Short',durationMode:'fixed',durationAmount:'3',durationUnit:'round',durationEventTypeRef:'turn-end'}),current:{id:'d'}});
  assert.deepEqual([fixed.mode,fixed.amount,fixed.unit,fixed.eventTypeRef],['fixed',3,'round',null],'fields of other modes are not kept');
  const whileReady=collectEntryData('duration',{...form({nameKey:'While',durationMode:'whileCondition',durationConditionRef:'ready',durationAmount:'3'}),current:{id:'w'}});
  assert.deepEqual([whileReady.conditionRef,whileReady.amount,whileReady.unit],['ready',null,null]);
});

test('a Permission policy saves its scope from one select and its rules from rows', async () => {
  const {parseScopeToken,collectPermissionRules}=await import('../src/configurator/permission-form.mjs');
  assert.deepEqual(parseScopeToken('ruleset'),{objectKind:'ruleset'});
  assert.deepEqual(parseScopeToken('definition:'),{objectKind:'definition',objectId:null});
  assert.deepEqual(parseScopeToken('action:strike'),{objectKind:'action',objectId:'strike'});
  const props={effect:'DENY',minimumOwnership:'owner',conditionRef:'',priority:'5',messageKey:' Too tired '};
  const checked={operations:['execute'],roles:['player','trusted']};
  const row={dataset:{ruleId:'r1',ruleOriginal:JSON.stringify({id:'r1',userIds:['u1']})},
    querySelector:selector=>({value:props[selector.match(/data-rule-prop="(\w+)"/)[1]]}),
    querySelectorAll:selector=>(checked[selector.match(/data-rule-prop="(\w+)"/)[1]]??[]).map(value=>({value}))};
  assert.deepEqual(collectPermissionRules([row]),[{id:'r1',userIds:['u1'],effect:'DENY',operations:['execute'],roles:['player','trusted'],minimumOwnership:'owner',conditionRef:null,priority:5,messageKey:'Too tired'}]);
});

test('a Trigger filter is built from payload-field rows typed by the field', async () => {
  const {collectTriggerFilter,triggerFilterContext}=await import('../src/configurator/trigger-filter-form.mjs');
  const row=(key,valueType,value,disabled=false)=>({querySelector:selector=>selector==='[data-filter-field]'?{value:key,selectedOptions:[{disabled,dataset:{valueType}}]}:{value}});
  assert.deepEqual(collectTriggerFilter([row('amount','number','5'),row('kind','string','fire'),row('crit','boolean','true')]),{payloadMatches:{amount:5,kind:'fire',crit:true}});
  assert.equal(collectTriggerFilter([row('amount','number','5',true)]),null,'a field of another Event Type is dropped');
  const context=triggerFilterContext({eventTypeId:'hit',eventFilter:{payloadMatches:{amount:5}}},{eventTypes:[{id:'hit',payloadFields:{amount:{name:'Amount',valueType:'number'}}},{id:'heal',payloadFields:{gain:{name:'Gain',valueType:'number'}}}]});
  assert.deepEqual(context.triggerFilterRows[0].fieldChoices.map(x=>[x.id,x.selected,x.disabled]),[['amount',true,false],['gain',false,true]]);
});

test('a Test target is chosen in one select: none, a fixed value or a Formula', () => {
  const save=values=>collectEntryData('test',{...form({nameKey:'T',...values}),current:{id:'t'}});
  assert.deepEqual([save({targetSource:'__fixed',targetValue:'12'}).targetValue,save({targetSource:'__fixed',targetValue:'12'}).targetFormulaRef],[12,null]);
  assert.deepEqual([save({targetSource:'dc',targetValue:'12'}).targetValue,save({targetSource:'dc'}).targetFormulaRef],[null,'dc']);
  assert.deepEqual([save({targetSource:''}).targetValue,save({targetSource:''}).targetFormulaRef],[null,null]);
});

test('an Action says what happens on each Outcome of its Test', async () => {
  const {outcomeMappingContext,collectOutcomeMappings}=await import('../src/configurator/action-outcome-form.mjs');
  const context=outcomeMappingContext({testRef:'attack',outcomeMappings:[{outcomeId:'miss',block:true}]},{tests:[{id:'attack',outcomeRefs:['hit'],fallbackOutcomeRef:'miss'}],outcomes:[{id:'hit',nameKey:'Hit'},{id:'miss',nameKey:'Miss'}],effects:[{id:'dmg',nameKey:'Damage'}]});
  assert.deepEqual(context.outcomeMappingGroups[0].rows.map(row=>[row.outcomeId,row.modeChoices.find(m=>m.selected).id]),[['hit','default'],['miss','block']]);
  const row=(id,mode,effects=[])=>({dataset:{outcomeMapping:id},querySelector:()=>({value:mode}),querySelectorAll:()=>effects.map(value=>({value}))});
  assert.deepEqual(collectOutcomeMappings([row('hit','effects',['dmg']),row('graze','default'),row('miss','block')]),[{outcomeId:'hit',effectRefs:['dmg']},{outcomeId:'miss',block:true}]);
});
