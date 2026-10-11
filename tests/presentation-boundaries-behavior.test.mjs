import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSelectOptions,renderCreationKindsOptions} from '../src/ui/select-option-markup.mjs';
import {renderCreationCheckboxPicker} from '../src/ui/picker-markup.mjs';
import {renderConfirmContent,renderPromptContent} from '../src/ui/dialog-markup.mjs';

test('native options render stable persisted values and escape user-controlled content',()=>{
 const markup=renderSelectOptions([{id:'id"<',label:'<img src=x onerror=1>',colors:'#809000'}],{colorize:true});
 assert.match(markup,/value="id&quot;&lt;"/);
 assert.match(markup,/&lt;img src=x onerror=1&gt;/);
 assert.match(markup,/data-rta-colors="#809000"/);
 assert.doesNotMatch(markup,/<img/);
 assert.equal(renderCreationKindsOptions(['choice','allocation'],'allocation'),'<option value="choice">choice</option><option value="allocation" selected>allocation</option>');
});

test('creation picker renders canonical checkbox list with stable attribute names',()=>{
 const html=renderCreationCheckboxPicker({property:'sourceObjects',items:[{id:'obj1',label:'A'}],selected:['obj1']});
 assert.match(html,/data-step-prop="sourceObjects"/);
 assert.match(html,/class="rta-picker__body rta-choice-list"/);
 assert.match(html,/data-step-source-object/);
 assert.match(html,/value="obj1" checked/);
 assert.doesNotMatch(html,/<select|<details/);
});

test('dialog markup remains safe after extraction from Foundry-facing controller',()=>{
 assert.equal(renderConfirmContent('A < B'),'<p>A &lt; B</p>');
 const html=renderPromptContent('Name',`a" onfocus="alert(1)`);
 assert.match(html,/name="value"/);
 assert.match(html,/value="a&quot; onfocus=&quot;alert\(1\)"/);
 assert.doesNotMatch(html,/ onfocus="/);
});
