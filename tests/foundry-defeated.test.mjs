import test from 'node:test';
import assert from 'node:assert/strict';
import {defeatedChanges} from '../src/runtime/foundry-defeated.mjs';

test('the defeated Condition marks a combatant when it starts holding and clears it when it stops', () => {
  const last=new Map();
  assert.deepEqual(defeatedChanges([{id:'a',holds:false,defeated:false},{id:'b',holds:true,defeated:false},{id:'x',holds:null,defeated:false}],last),[{id:'b',defeated:true}]);
  // The GM marks a defeated by hand: the Condition did not change, the mark stays.
  assert.deepEqual(defeatedChanges([{id:'a',holds:false,defeated:true},{id:'b',holds:true,defeated:true}],last),[]);
  // a falls to 0, b is healed.
  assert.deepEqual(defeatedChanges([{id:'a',holds:true,defeated:true},{id:'b',holds:false,defeated:true}],last),[{id:'b',defeated:false}]);
  assert.deepEqual(defeatedChanges([{id:'a',holds:false,defeated:true}],last),[{id:'a',defeated:false}]);
});
