import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntrySeed} from '../src/configurator/entry-seed.mjs';
import {prepareRoll,prepareTest} from '../src/configurator/rule-contracts.mjs';
const base={uid:name=>`${name}-id`,listContentTypes:()=>[{id:'content-type-id'}],getDefinitionType:id=>({id,defaultCapabilities:['ability'],requiredCapabilities:['value']})};
test('new Roll and Test have no imposed die expression or numeric difficulty',()=>{
 const roll=createEntrySeed('roll',base),check=createEntrySeed('test',base);
 assert.equal(roll.formula,'');assert.equal(check.targetValue,null);
 assert.throws(()=>prepareRoll({...roll,nameKey:'My roll'}),/Roll\.formula is required/);
 assert.equal(prepareTest({...check,nameKey:'My test',rollRef:'my-roll'}).targetValue,null);
});
test('legacy explicitly saved Roll and Test values remain unchanged after validation',()=>{
 const roll=prepareRoll({...createEntrySeed('roll',base),nameKey:'Existing',formula:'1d20'});
 assert.equal(roll.formula,'1d20');
 const check=prepareTest({...createEntrySeed('test',base),nameKey:'Existing check',rollRef:'roll-id',targetValue:13});
 assert.equal(check.targetValue,13);
});
test('new Definition uses its Ruleset-configured Definition Type rather than default skills',()=>{
 const seed=createEntrySeed('definition',{...base,definitionTypeId:'any-game-type'});
 assert.equal(seed.definitionTypeId,'any-game-type');
 assert.deepEqual(seed.capabilities,['ability','value']);
});
