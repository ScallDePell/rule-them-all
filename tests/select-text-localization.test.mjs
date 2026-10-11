import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionPlaceholder,selectUiText} from '../src/ui/select-text.mjs';

const previousGame=globalThis.game;
const root=label=>({dataset:{rtaSelectLabel:label}});
test('RTA Select keeps generic placeholders and selected labels independent of RPG rules',()=>{
 try{
  globalThis.game={i18n:{lang:'en',localize:key=>key}};
  assert.equal(selectionPlaceholder(root(''),false),'Select a item');
  assert.equal(selectionPlaceholder(root(''),true),'Select one or more items');
  assert.equal(selectionPlaceholder(root('Definitions'),true),'Select one or more Definitions');
  globalThis.game={i18n:{lang:'fr',localize:key=>key}};
  assert.equal(selectionPlaceholder(root(''),false),'Sélectionner un objet');
  assert.equal(selectionPlaceholder(root(''),true),'Sélectionner un ou plusieurs objets');
  assert.equal(selectionPlaceholder(root('Compétences'),true),'Sélectionner un ou plusieurs Compétences');
 }finally{globalThis.game=previousGame;}
});

test('RTA Select accepts Foundry localization without changing stored selection value',()=>{
 try{
  globalThis.game={i18n:{lang:'fr',localize:key=>key==='RTA.Select.Search'?'Chercher…':key==='RTA.Select.Single'?'Choisir {label}':key}};
  assert.equal(selectUiText('Search'),'Chercher…');
  assert.equal(selectionPlaceholder(root('une action'),false),'Choisir une action');
 }finally{globalThis.game=previousGame;}
});
