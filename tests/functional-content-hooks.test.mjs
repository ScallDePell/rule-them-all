import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwningContentHook} from '../src/runtime/foundry-content-hooks.mjs';
test('broadcast Foundry item hooks must never acquire or release for remote users',()=>{
 const item={parent:{documentName:'Actor'}};
 assert.equal(isOwningContentHook(item,'gm','gm'),true);
 assert.equal(isOwningContentHook(item,'other','gm'),false);
 assert.equal(isOwningContentHook(item,undefined,'gm'),false);
 assert.equal(isOwningContentHook({parent:{documentName:'Item'}},'gm','gm'),false);
});
