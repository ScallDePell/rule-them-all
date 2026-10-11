import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Import production helpers directly; no eval or source slicing.
import {renderPickerOptions,renderChoiceListBody} from "../src/ui/picker-markup.mjs";

test("real picker output escapes input and renders exactly one checked choice",()=>{
 const content=renderPickerOptions([{id:'a"&',label:'<Strong> & great'},{id:'other',label:'Other'}],{selected:['a"&'],attribute:'data-step-source-object'});
 assert.equal((content.match(/<label /g)||[]).length,2);
 assert.match(content,/&lt;Strong&gt; &amp; great/);
 assert.match(content,/value="a&quot;&amp;"/);
 assert.equal((content.match(/ checked/g)||[]).length,1);
 assert.match(content,/data-step-source-object/);
});

test("real visible and accordion list body is the same with different data",()=>{
 const items=[{id:'one',label:'One'},{id:'two',label:'Two'}];
 const creation=renderChoiceListBody(items,{selected:['one'],attribute:'data-step-source-family'});
 const relation=renderChoiceListBody(items,{selected:['one'],name:'choiceTargetRef',placeholder:'Search Definitions…'});
 for(const html of [creation,relation]){
  assert.match(html,/class="rta-picker__body rta-choice-list"/);
  assert.match(html,/data-picker-filter/);
  assert.equal((html.match(/<label /g)||[]).length,2);
  assert.equal((html.match(/ checked/g)||[]).length,1);
 }
 assert.match(creation,/data-step-source-family/);
 assert.match(relation,/name="choiceTargetRef"/);
});

test("empty lists render a readable state and search text is escaped",()=>{
 const html=renderChoiceListBody([],{placeholder:'<img>',emptyMessage:'No <choices>'});
 assert.match(html,/placeholder="&lt;img&gt;"/);
 assert.match(html,/No &lt;choices&gt;/);
 assert.doesNotMatch(html,/<img>/);
});

test("read-only choice options are disabled without changing row markup",()=>{
 const html=renderPickerOptions([{id:'a',label:'A'}],{disabled:true});
 assert.match(html,/ disabled/);
 assert.match(html,/data-picker-option/);
});
