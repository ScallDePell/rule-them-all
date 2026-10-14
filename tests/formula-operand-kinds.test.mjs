import test from 'node:test';
import assert from 'node:assert/strict';
import {expressionBuilderModel,formOf,nodeOf,buildable,rootFormOf,blockNodeOf,reshapeBlock,slotView,contextPathSuggestions} from '../src/configurator/entry-expression-model.mjs';
import {renderExpressionBuilderHTML,renderExpressionSlotHTML} from '../src/ui/expression-builder-markup.mjs';

const lit=value=>({type:'literal',value});
const str={objectKind:'definition',objectId:'str',capabilityId:'value',outputId:'value.final'};
/* D&D 5e: floor((score - 10) / 2). */
const modifier={type:'floor',value:{type:'divide',args:[{type:'subtract',args:[{type:'reference',reference:str},lit(10)]},lit(2)]}};
/* Call of Cthulhu: a fumble is 96-100 under a skill of 50, else only 100. */
const fumble={type:'if',condition:{type:'lt',left:{type:'reference',reference:str,container:'target'},right:lit(50)},then:{type:'gte',left:{type:'context',path:'variables.test.natural'},right:lit(96)},else:{type:'eq',left:{type:'context',path:'variables.test.natural'},right:lit(100)}};

test('The builder shows every expression node the engine evaluates, nested, and writes it back unchanged', ()=>{
  const cases=[[modifier,'formula'],[fumble,'condition'],
    [{type:'rangeLookup',value:{type:'parameter',id:'p'},ranges:[{max:5,value:'faible'},{min:6,max:9,value:1},{min:10,value:2}],default:lit(0)},'formula'],
    [{type:'lookup',key:{type:'context',path:'variables.input.size'},table:[{key:'small',value:1},{key:'large',value:2}]},'formula'],
    [{type:'clamp',value:{type:'mod',args:[{type:'formula',id:'f'},lit(3)]},min:lit(0),max:{type:'round',value:lit(2.5)}},'formula'],
    [{type:'and',args:[{type:'not',value:{type:'gt',left:{type:'dice',read:'count',group:'hunger',compare:'eq',value:lit(10)},right:lit(0)}},{type:'or',args:[lit(true),{type:'lte',left:{type:'distance',from:'self',to:'target'},right:{type:'nearby',of:'self',within:lit(2),side:'enemy'}}]}]},'condition'],
    [{type:'ceil',value:{type:'average',args:[lit(1),lit(2)]}},'formula'],[lit(true),'condition'],[lit(false),'condition'],[lit(3),'formula'],[{type:'parameter',id:'p'},'condition']];
  for(const [expression,editor] of cases){
    assert.ok(buildable(expression,editor),JSON.stringify(expression));
    assert.deepEqual(blockNodeOf(rootFormOf(expression,editor)),expression);
  }
});

test('An expression the builder would change keeps the technical view', ()=>{
  for(const expression of [{type:'definitionValue',definition:lit('x'),capabilityId:'value',outputId:'value.final'},{type:'add',args:[lit(1)],note:'x'},
    lit('12'),lit(null),{type:'floor',arg:lit(2)},{type:'rangeLookup',value:lit(1),ranges:[{min:null,value:1}]},{type:'nearby',of:'self',within:{type:'formula',id:'reach'}}])
    assert.equal(expressionBuilderModel(expression,'formula',{}).supported,false,JSON.stringify(expression));
});

test('A Reference may be read on another role, and the default role is not written', ()=>{
  assert.deepEqual(nodeOf(formOf({type:'reference',reference:str,container:'target'})),{type:'reference',reference:str,container:'target'});
  assert.deepEqual(nodeOf({...formOf({type:'reference',reference:str}),container:'-'}),{type:'reference',reference:str});
  assert.equal(slotView(formOf({type:'reference',reference:str}),{label:{}},{references:[{token:'definition|str|value||value.final',label:'Str'}]}).referenceRoleChoices[0].selected,true);
  const view=slotView(formOf({type:'reference',reference:str,container:'pilot'}),{label:{key:'k',fallback:'Value'}},{roles:['vehicle']});
  assert.deepEqual(view.referenceRoleChoices.map(choice=>choice.id),['-','self','target','source','owner','subject','leader','world','combat','vehicle','pilot']);
  assert.equal(view.referenceRoleChoices.find(choice=>choice.selected).id,'pilot');
});

test('A new operation keeps the operands it can, and a table starts with one row', ()=>{
  const add={operation:'add',children:[{kind:'literal',value:'1'},{kind:'literal',value:'2'},{kind:'literal',value:'3'}],rows:[]};
  assert.deepEqual(reshapeBlock('floor',add.children).children,[{kind:'literal',value:'1'}]);
  assert.equal(reshapeBlock('if',add.children).children.length,3);
  assert.deepEqual(reshapeBlock('rangeLookup',add.children),{operation:'rangeLookup',children:[{kind:'literal',value:'1'},{kind:'none'}],rows:[{min:'',max:'',value:'0'}]});
  assert.deepEqual(blockNodeOf(reshapeBlock('lookup',[])),{type:'lookup',key:lit(0),table:[{key:'',value:0}]});
  assert.throws(()=>nodeOf({kind:'nearby',of:'self',within:'',side:'any'}),/must be a number/);
});

test('The markup draws nested blocks, table rows and the context paths of the Ruleset', ()=>{
  const ruleset={actions:[{id:'a',inputs:[{id:'difficulte',labelKey:'Difficulté'}]}],creationSystems:[{id:'c',steps:[{id:'carriere',name:'Carrière'}]}],eventTypes:[{id:'e',nameKey:'Temps',payloadFields:{days:{name:'Jours'}}}]};
  const contextPaths=contextPathSuggestions(ruleset),values=contextPaths.map(path=>path.value);
  for(const value of ['variables.test.natural','variables.test.outcome.resultKey','variables.input.difficulte','variables.creation.carriere.count','event.payload.days','variables.allocation.point','variables.group.best'])assert.ok(values.includes(value),value);
  const html=renderExpressionBuilderHTML(expressionBuilderModel(modifier,'formula',{}),{contextListId:'paths',contextPaths});
  assert.match(html,/name="formulaOperator" data-expr-operation><option value="single"[^>]*>[^<]*<\/option><option value="add"/);
  assert.match(html,/value="floor"[^>]* selected/);
  assert.match(html,/data-expr-path="value\.args\[0\]\.args\[0\]"/);
  assert.match(html,/<datalist id="paths"><option value="variables\.test\.total" label="/);
  const table=renderExpressionBuilderHTML(expressionBuilderModel({type:'rangeLookup',value:{type:'context',path:'variables.test.total'},ranges:[{max:5,value:1},{min:6,value:2}]},'formula',{}),{contextListId:'paths',contextPaths});
  assert.match(table,/data-expr-path="ranges\[1\]"><input type="number" step="any" data-row-part="min" value="6"/);
  assert.match(table,/data-action="addExprRow"/);
  assert.match(table,/list="paths"/);
  const slot=renderExpressionSlotHTML(slotView({kind:'literal',value:'0'},{label:{key:'k',fallback:'Operand',number:3},removable:true}));
  for(const kind of ['dice','distance','nearby','context','expression'])assert.match(slot,new RegExp(`data-rule-operand-editor="${kind}" hidden`));
});
