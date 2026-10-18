import test from 'node:test';
import assert from 'node:assert/strict';
import {copyJSON} from '../src/configurator/configurator-schema.mjs';
import {FoundryRuntimeAdapter} from '../src/runtime/foundry-runtime-adapter.mjs';
import {resultRolls} from '../src/runtime/foundry-chat.mjs';

// Foundry's Roll#toJSON keeps class instances (its _dice, term options) and undefined values: the adapter's roll must
// still be plain JSON, since the engine copies every roll it logs (the "Expected plain JSON data." of every test in play).
class Term{constructor(){this.faces=20;this.results=[{result:14,active:true}];this.options={flavor:undefined};}get total(){return 14;}toJSON(){return {class:'Die',faces:20,results:this.results,options:this.options,evaluated:true};}}
class FakeRoll{
  constructor(formula,data){this.formula=formula;this.data=data;this.terms=[new Term()];this.dice=this.terms;this.total=14;this.result='14';}
  async evaluate(){return this;}
  toJSON(){return {class:'Roll',options:{rollMode:undefined},dice:this.dice,formula:this.formula,terms:this.terms.map(t=>t.toJSON()),total:this.total,evaluated:true};}
}

test('a Foundry roll comes back from the adapter as plain JSON, with its Roll data kept for the chat card',async()=>{
  const previous=globalThis.Roll;globalThis.Roll=FakeRoll;
  try{
    const roll=await new FoundryRuntimeAdapter().roll('1d20',{});
    const copy=copyJSON(roll);
    assert.equal(copy.total,14);
    assert.equal(copy.foundryRoll.formula,'1d20');
    assert.equal(copy.foundryRoll.dice[0].faces,20);
    assert.deepEqual(resultRolls({use:{dice:[{roll:copy}]}}).map(r=>r.total),[14]);
  }finally{globalThis.Roll=previous;}
});
