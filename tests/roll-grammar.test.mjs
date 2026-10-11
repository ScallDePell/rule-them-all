import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRollFormula} from '../src/configurator/roll-grammar.mjs';
import {prepareRoll} from '../src/configurator/rule-contracts.mjs';

const SAFE=['1d20','d20','20','2d6+3','4d6kh3','1d20 + @abilities.str.mod','(@level)d8','1d@faces','2d6x','1d20cs>=19','d%','4dF',
  'floor(@x/2) + 1','min(1d6, 3)','max(2d6,1d12)-1','10d6r1','-1d4','1.5*2','(1d6+2)*2','8d6dl2','3d6rr<2','1d6xo'];
const UNSAFE=['','1d20[fire]','Math.random()','1d20; alert(1)','"1d20"','constructor','1d20 + foo','1d0','1001d6','1d20y','1.5d6',
  '@x.()','1d20 ** 2','eval(1)','1d6kh>','2d6 + ','()','x'.repeat(300)];

test('the dice grammar accepts the supported Foundry dice syntax',()=>{
  for(const formula of SAFE)assert.doesNotThrow(()=>parseRollFormula(formula),formula);
  assert.deepEqual(parseRollFormula('1d20 + @abilities.str.mod + @level').references,['abilities.str.mod','level']);
});

test('the dice grammar rejects anything that is not a dice expression',()=>{
  for(const formula of UNSAFE)assert.throws(()=>parseRollFormula(formula),error=>error.code==='ROLL_FORMULA_INVALID',formula);
});

test('a Roll definition cannot persist an unsafe formula',()=>{
  assert.throws(()=>prepareRoll({id:'r',nameKey:'R',formula:'1d20 + Math.random()'}),/Invalid Roll formula/);
  assert.equal(prepareRoll({id:'r',nameKey:'R',formula:'1d20+@bonus'}).formula,'1d20+@bonus');
});
