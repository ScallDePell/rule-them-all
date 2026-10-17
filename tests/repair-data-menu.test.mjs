import test from 'node:test';
import assert from 'node:assert/strict';
import {repairData} from '../src/configurator/repair-data-menu.mjs';

const fakeDialog = answers => {
  const shown = [];
  return {shown, prompt: async options => { shown.push(['prompt', options.content]); return null; },
    confirm: async options => { shown.push(['confirm', options.content]); return answers.shift(); }};
};

test('nothing to repair: the GM is told, nothing is written', async () => {
  const calls = [], Dialog = fakeDialog([]);
  await repairData({convert: async options => { calls.push(options); return {ok: true, changed: false, notes: []}; }, Dialog});
  assert.deepEqual(calls, [undefined]);
  assert.match(Dialog.shown[0][1], /RTA.Repair.Nothing/);
});

test('data to repair: the changes are listed, repaired on confirmation, then the World reloads', async () => {
  const calls = [], Dialog = fakeDialog([true, true]);
  let reloaded = false;
  await repairData({convert: async options => { calls.push(options ?? null); return {ok: true, changed: true, notes: ['v1: 2 Categories merged into Tags']}; }, Dialog, reload: () => { reloaded = true; }});
  assert.deepEqual(calls, [null, {write: true}]);
  assert.match(Dialog.shown[0][1], /Categories merged into Tags/);
  assert.ok(reloaded);
});

test('declined or failed: nothing is written', async () => {
  const calls = [];
  await repairData({convert: async options => { calls.push(options ?? null); return {ok: true, changed: true, notes: []}; }, Dialog: fakeDialog([false])});
  assert.deepEqual(calls, [null]);
  const Dialog = fakeDialog([]);
  await repairData({convert: async () => ({ok: false, changed: true, notes: [], error: 'still invalid'}), Dialog});
  assert.match(Dialog.shown[0][1], /RTA.Repair.Failed/);
});
