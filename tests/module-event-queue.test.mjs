import test from 'node:test';
import assert from 'node:assert/strict';
import {createModuleEventQueue} from '../src/runtime/module-event-queue.mjs';
import {combatChangeEvents, combatTurnEvent} from '../src/configurator/system-events.mjs';

test('the first combatant hears its turn after the combat start, whichever hook fires first', async()=>{
  const sent=[], queue=createModuleEventQueue(async(type,payload,refs)=>{sent.push(`${type.replace('rta.combat.','')}:${refs.map(r=>r.uuid??r.id??r).join('+')}`);},{onError:error=>{throw error;}});
  const combat={id:'c',round:1,turn:0,started:true,combatants:[{id:'a',actor:{uuid:'A'}},{id:'b',actor:{uuid:'B'}}],combatant:{id:'a'},getFlag:()=>1};
  // Foundry may run updateCombat before combatTurnChange: the turn alone first, then start and round.
  queue.push(()=>[combatTurnEvent(combat)]);
  queue.push(()=>{const events=combatChangeEvents(combat,{round:0,turn:null},{round:1,turn:0});return events.some(e=>e.eventTypeId==='rta.combat.turn')?events:[...events,combatTurnEvent(combat)];});
  queue.push(()=>[combatTurnEvent(combat)]);
  await queue.idle();
  assert.deepEqual(sent.map(s=>s.split(':')[0]),['turn','start','round','turn'],'the turn again after the start resets it, then once only');
  // The next combatant, then a new round with the same first combatant: heard each time.
  queue.push(()=>[combatTurnEvent({...combat,turn:1,combatant:{id:'b'}})]);
  queue.push(()=>combatChangeEvents({...combat,round:2},{round:1,turn:1},{round:2,turn:0,combatantId:'a'}));
  await queue.idle();
  assert.deepEqual(sent.slice(4),['turn:B','round:A+B+c','turn:A']);
});
