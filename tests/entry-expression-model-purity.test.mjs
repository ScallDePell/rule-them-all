import test from 'node:test';
import assert from 'node:assert/strict';
import {refToken,parseRefToken} from '../src/configurator/reference-token.mjs';
import {simpleFormulaModel,simpleConditionModel,operandEditorRow} from '../src/configurator/entry-expression-model.mjs';

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
 const model=operandEditorRow({type:'reference',reference},1,sources);
 assert.equal(model.operandLabel,'Operand 2');
 assert.equal(model.referenceChoices[0].selected,true);
 assert.equal(model.parameterChoices[0].colors,'#123456');
 assert.equal(model.formulaChoices[0].colors,'#654321');
 assert.equal(model.parameterChoices[0].selected,false);
 assert.equal(model.formulaChoices[0].selected,false);
});

test('formula models preserve operand order and supported states without a Foundry global',()=>{
 const model=simpleFormulaModel({type:'add',args:[{type:'parameter',id:'p'},{type:'formula',id:'f'}]},sources);
 assert.equal(model.supported,true);
 assert.equal(model.opAdd,true);
 assert.equal(model.operands[0].parameterChoices[0].selected,true);
 assert.equal(model.operands[1].formulaChoices[0].selected,true);
 const single=simpleFormulaModel({type:'literal',value:3},sources);
 assert.equal(single.opSingle,true);
 assert.equal(single.operands[0].literalValue,'3');
 assert.equal(simpleFormulaModel({type:'custom',unknown:true},sources).supported,false);
});

test('condition model retains binary comparisons and boolean literal decisions',()=>{
 const model=simpleConditionModel({type:'gte',left:{type:'parameter',id:'p'},right:{type:'literal',value:6}},sources);
 assert.equal(model.supported,true);
 assert.equal(model.opGte,true);
 assert.equal(model.left.parameterChoices[0].selected,true);
 assert.equal(model.right.literalValue,'6');
 assert.equal(simpleConditionModel({type:'literal',value:true},sources).opAlwaysTrue,true);
 assert.equal(simpleConditionModel({type:'literal',value:false},sources).opAlwaysFalse,true);
 assert.equal(simpleConditionModel({type:'unknown'},sources).supported,false);
});
