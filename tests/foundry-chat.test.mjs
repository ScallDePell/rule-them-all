import test from 'node:test';
import assert from 'node:assert/strict';
import {actionMessageData, postActionCard, resultRolls} from '../src/runtime/foundry-chat.mjs';

const result = {use: {dice: [{formula: '1d20', roll: {total: 12, foundryRoll: {formula: '1d20', total: 12}}}, {formula: '1d6', roll: {total: 3}}]}};
class FakeRoll { static fromData(json) { return Object.assign(new FakeRoll(), json); } }

test('the chat card carries the Foundry Rolls thrown, not the kept ones', () => {
  assert.deepEqual(resultRolls(result), [{formula: '1d20', total: 12}]);
  assert.deepEqual(resultRolls({}), []);
});

test('the card follows the roll mode chosen in the chat box', () => {
  const modes = [];
  const ChatMessage = {applyRollMode: (data, mode) => { modes.push(mode); if (mode === 'gmroll') data.whisper = ['gm']; }};
  const data = actionMessageData({summary: {title: 'Hit', lines: [{label: '1d20', value: '12'}]}, speaker: {alias: 'A'}, result}, {RollClass: FakeRoll, ChatMessage, rollMode: 'gmroll', sound: 'dice.wav'});
  assert.equal(data.rolls.length, 1);
  assert.ok(data.rolls[0] instanceof FakeRoll);
  assert.equal(data.sound, 'dice.wav');
  assert.deepEqual(data.whisper, ['gm']);
  assert.deepEqual(modes, ['gmroll']);
});

test('a card without dice has no rolls and no sound', async () => {
  const created = [];
  await postActionCard({create: data => created.push(data)}, {summary: {title: 'Rest'}, result: {use: {dice: []}}});
  assert.deepEqual(Object.keys(created[0]), ['content']);
  assert.match(created[0].content, /Rest/);
});

test('a blind card shows the players only its title, the GM all of it', () => {
  const ChatMessage = {applyRollMode: data => { data.blind = true; data.whisper = ['gm']; }};
  const data = actionMessageData({summary: {title: 'Spot', lines: [{label: 'Perception', value: '17'}]}, result}, {RollClass: FakeRoll, ChatMessage, rollMode: 'blindroll'});
  assert.doesNotMatch(data.content, /17/);
  assert.match(data.content, /Spot/);
  assert.match(data.flags['rule-them-all'].blindCard, /17/);
});

test('a card with buttons keeps the offer; who may press each is checked per user', async () => {
  const {mayPress, answeringTargets} = await import('../src/runtime/foundry-chat.mjs');
  const offer = {rulesetVersionId: 'v', actionId: 'attack', context: {roles: {self: {uuid: 'Actor.hero'}, target: {uuid: 'Actor.foe'}}}, previous: {total: 16}, buttons: [{index: 0, actionId: 'riposte', who: 'target'}]};
  const data = actionMessageData({summary: {title: 'Attack', buttons: [{index: 0, who: 'target', label: 'Riposte'}]}, result: {chatOffer: offer}}, {RollClass: FakeRoll, ChatMessage: {}, rollMode: null});
  assert.deepEqual(data.flags['rule-them-all'].chatOffer, offer);
  assert.match(data.content, /data-rta-chat-action="0"/);
  const owned = new Set(['Actor.foe']);
  globalThis.fromUuidSync = uuid => ({isOwner: owned.has(uuid)});
  try {
    const player = {user: {isGM: false}}, gm = {user: {isGM: true}};
    assert.equal(mayPress(offer, 'target', player), true);
    assert.equal(mayPress(offer, 'self', player), false);
    assert.equal(mayPress(offer, 'gm', player), false);
    assert.equal(mayPress(offer, 'gm', gm), true);
    assert.deepEqual(answeringTargets(offer, player), [{uuid: 'Actor.foe'}]);
  } finally { delete globalThis.fromUuidSync; }
});
