import test from 'node:test';
import assert from 'node:assert/strict';
import {readPanels, clampWidth, PANEL_LIMITS} from '../src/configurator/sheet-editor-panels.mjs';
const store=value=>({getItem:()=>value,setItem(){}});

test('The side panels start at their own width, shown, without a kept choice or with an unreadable one', ()=>{
  const fresh={side:{width:null,hidden:false},layers:{width:null,hidden:false}};
  assert.deepEqual(readPanels(store(null)),fresh);
  assert.deepEqual(readPanels(store('not json')),fresh);
  assert.deepEqual(readPanels({getItem(){throw new Error('blocked');}}),fresh);
});

test('A kept width is held within the panel limits, and a hidden panel stays hidden', ()=>{
  const panels=readPanels(store(JSON.stringify({side:{width:9999,hidden:true},layers:{width:10}})));
  assert.deepEqual(panels,{side:{width:PANEL_LIMITS.side[1],hidden:true},layers:{width:PANEL_LIMITS.layers[0],hidden:false}});
  assert.equal(clampWidth('side',300.4),300);
});
