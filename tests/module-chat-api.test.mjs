import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../rule-them-all.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('other modules post an Action card through game.ruleThemAll.chat, with the summary the sheet uses',()=>{
  assert.match(entry,/game\.ruleThemAll\.chat = Object\.freeze\(\{postActionCard: \(result, versionId, \{speaker = null\} = \{\}\) => postActionCard\(ChatMessage, \{speaker, summary: summarize\(result, versionId\), result\}\)\}\);/);
  assert.match(entry,/installActionCards\(\{summarize\}\);/);
});
