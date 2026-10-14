import test from 'node:test';
import assert from 'node:assert/strict';
import {refToken,parseRefToken} from '../src/configurator/reference-token.mjs';
import {expressionBuilderModel,slotView,formOf} from '../src/configurator/entry-expression-model.mjs';

const sources={
 parameters:[{id:'p',nameKey:'Parameter'}],
 formulas:[{id:'f',nameKey:'Formula'}],
 references:[{token:refToken({objectKind:'definition',objectId:'id|with/special',capabilityId:'score'}),label:'Score'}],
 withColors:(kind)=>({colors:kind==='parameter'?'#123456':'#654321'})
};

test('reference tokens preserve the old storage format and escape reserved characters',()=>{
 const cases=[
   {objectKind:'definition',objectId:'id|with/special',capabilityId:'score'},
   {objectKind:'parameter',objectId:'with spaces & accents ecole'},
   {objectKind:'formula',objectId:'eq',slotId:'value',outputId:'out'},
 ];
 for(const reference of cases){
   const token=refToken(reference);
   assert.equal(token.split('|').length,5);
   assert.deepEqual(parseRefToken(token),reference);
 }
 assert.deepEqual(parseRefToken(''),{objectKind:'',objectId:undefined});
});

test('pure operand model retains source choices, selected state and category colours',()=>{
 const reference={objectKind:'definition',objectId:'id|with/special',capabilityId:'score'};
 const model=slotView(formOf({type:'reference',reference}),{label:{key:'RTA.Expression.Slot.operand',fallback:'Operand',number:2}},sources);
 assert.equal(model.label.number,2);
 assert.equal(model.referenceChoices[0].selected,true);
 assert.equal(model.referenceChoices[0].id,sources.references[0].token,'the option value is the reference token');
 assert.equal(model.parameterChoices[0].colors,'#123456');
 assert.equal(model.formulaChoices[0].colors,'#654321');
 assert.equal(model.parameterChoices[0].selected,false);
 assert.equal(model.formulaChoices[0].selected,false);
});

test('formula models preserve operand order and supported states without a Foundry global',()=>{
 const model=expressionBuilderModel({type:'add',args:[{type:'parameter',id:'p'},{type:'formula',id:'f'}]},'formula',sources);
 assert.equal(model.supported,true);
 assert.equal(model.root.operationChoices.find(choice=>choice.selected).id,'add');
 assert.equal(model.root.leadSlots[0].parameterChoices[0].selected,true);
 assert.equal(model.root.leadSlots[1].formulaChoices[0].selected,true);
 const single=expressionBuilderModel({type:'literal',value:3},'formula',sources);
 assert.equal(single.root.operation,'single');
 assert.equal(single.root.leadSlots[0].literalValue,'3');
 assert.equal(expressionBuilderModel({type:'custom',unknown:true},'formula',sources).supported,false);
});

test('condition model retains binary comparisons and boolean literal decisions',()=>{
 const model=expressionBuilderModel({type:'gte',left:{type:'parameter',id:'p'},right:{type:'literal',value:6}},'condition',sources);
 assert.equal(model.supported,true);
 assert.equal(model.root.operation,'gte');
 assert.equal(model.root.leadSlots[0].parameterChoices[0].selected,true);
 assert.equal(model.root.leadSlots[1].literalValue,'6');
 assert.equal(expressionBuilderModel({type:'literal',value:true},'condition',sources).root.operation,'alwaysTrue');
 assert.equal(expressionBuilderModel({type:'literal',value:false},'condition',sources).root.operation,'alwaysFalse');
 assert.equal(expressionBuilderModel({type:'unknown'},'condition',sources).supported,false);
});
