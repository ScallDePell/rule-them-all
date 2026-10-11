import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDuration, DURATION_MODES} from '../src/configurator/rule-contracts.mjs';
import {createEntrySeed} from '../src/configurator/entry-seed.mjs';

const base={id:'d',nameKey:'D'};

test('CP-08: Duration modes are the documented six; persistent is gone', () => {
  assert.deepEqual(DURATION_MODES,['instant','fixed','untilEvent','whileCondition','untilRemoved','absoluteTime']);
  assert.equal(prepareDuration(base).mode,'untilRemoved');
  assert.equal(createEntrySeed('duration',{uid:()=>'x'}).mode,'untilRemoved');
  assert.throws(()=>prepareDuration({...base,mode:'persistent'}),/Duration.mode is invalid: persistent/);
});

test('CP-08: absoluteTime needs a world time; a draft may lack it', () => {
  assert.throws(()=>prepareDuration({...base,mode:'absoluteTime'}),/requires at/);
  const incomplete=[];
  prepareDuration({...base,mode:'absoluteTime'},{incomplete});
  assert.deepEqual(incomplete,['absoluteTime Duration requires at.']);
  assert.equal(prepareDuration({...base,mode:'absoluteTime',at:86400}).at,86400);
  assert.throws(()=>prepareDuration({...base,mode:'absoluteTime',at:-1}),/non-negative world time/);
});
