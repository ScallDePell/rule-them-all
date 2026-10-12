import test from 'node:test';
import assert from 'node:assert/strict';
import {simpleFormulaModel,simpleConditionModel,operandEditorRow} from '../src/configurator/entry-expression-model.mjs';
import {collectRuleOperand} from '../src/configurator/entry-expression-serialization.mjs';
import {renderRuleOperandHTML} from '../src/ui/entry-editor-markup.mjs';

const lit=value=>({type:'literal',value});
/** An operand row as the form holds it: its kind select and the parts of each editor. */
const row=(kind,parts={})=>({querySelector:selector=>{
  if(selector==='[data-rule-operand-kind]')return {value:kind};
  const name=selector.match(/data-operand-part="([^"]+)"/)?.[1];
  return name&&parts[name]!==undefined?{value:parts[name]}:null;
}});

test('The builder shows the dice of the roll, distances, Actors nearby and context values', ()=>{
  const counters=[{id:'success',label:'Success'}];
  const dice=operandEditorRow({type:'dice',read:'count',group:'hunger',compare:'eq',value:lit(10)},0,{counters});
  assert.equal(dice.isDice,true);assert.equal(dice.diceGroup,'hunger');assert.equal(dice.diceValue,'10');
  assert.equal(dice.diceCompareChoices.find(c=>c.selected).id,'eq');assert.equal(dice.diceReadChoices.find(c=>c.selected).id,'count');
  const counter=operandEditorRow({type:'dice',read:'counter',counter:'success'},0,{counters});
  assert.equal(counter.diceIsCounter,true);assert.equal(counter.diceCounterChoices[0].selected,true);
  assert.equal(operandEditorRow({type:'nearby',of:'target',within:lit(2),side:'enemy'},0).nearbySideChoices.find(c=>c.selected).id,'enemy');
  assert.equal(simpleFormulaModel({type:'add',args:[{type:'distance',from:'self',to:'target'},{type:'context',path:'variables.test.total'}]},{}).supported,true);
});

test('An operand the builder cannot show keeps the whole expression in the technical view', ()=>{
  assert.equal(simpleFormulaModel({type:'add',args:[lit(1),{type:'floor',value:lit(2)}]},{}).supported,false,'a nested node would be lost');
  assert.equal(simpleConditionModel({type:'gte',left:{type:'nearby',of:'self',within:{type:'formula',id:'reach'}},right:lit(1)},{}).supported,false);
});

test('The form writes the new operands back', ()=>{
  assert.deepEqual(collectRuleOperand(row('dice',{read:'count',group:'hunger',compare:'eq',value:'10'})),{type:'dice',read:'count',group:'hunger',compare:'eq',value:lit(10)});
  assert.deepEqual(collectRuleOperand(row('dice',{read:'highest',group:'',compare:'any',value:''})),{type:'dice',read:'highest'});
  assert.deepEqual(collectRuleOperand(row('dice',{read:'counter',group:'',counter:'success'})),{type:'dice',read:'counter',counter:'success'});
  assert.deepEqual(collectRuleOperand(row('distance',{from:'self',to:'target'})),{type:'distance',from:'self',to:'target'});
  assert.deepEqual(collectRuleOperand(row('nearby',{of:'target',within:'2',side:'enemy'})),{type:'nearby',of:'target',within:lit(2),side:'enemy'});
  assert.deepEqual(collectRuleOperand(row('context',{path:'variables.test.total'})),{type:'context',path:'variables.test.total'});
  assert.throws(()=>collectRuleOperand(row('nearby',{of:'self',within:'',side:'any'})),/must be a number/);
  const added=renderRuleOperandHTML({index:2,parameters:'',formulas:'',references:''});
  for(const kind of ['dice','distance','nearby','context'])assert.match(added,new RegExp(`data-rule-operand-editor="${kind}" hidden`));
});
