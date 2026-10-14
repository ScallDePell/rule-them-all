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
 assert.equal(renderCreationKindsOptions(['choice','allocation'],'allocation'),'<option value="choice">Choice</option><option value="allocation" selected>Point allocation</option>');
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

import {buildFieldRow,buildEventFieldRow,valueTypeChoices} from '../src/configurator/entry-field-models.mjs';
import {renderCreationStepHTML} from '../src/ui/entry-editor-markup.mjs';
test('value types and step kinds are shown in words from lang, while option values stay the stored ids',()=>{
 const fr={'RTA.ValueTypes.integer':'Nombre entier','RTA.ValueTypes.string':'Texte','RTA.Template.Many':'plusieurs','RTA.CreationStepKind.allocation':'Répartition de points'};
 const previous=globalThis.game;globalThis.game={i18n:{localize:key=>fr[key]??key}};
 try{
  assert.deepEqual(valueTypeChoices(['integer','string'],'string').map(x=>[x.id,x.label,x.selected]),[['integer','Nombre entier',false],['string','Texte',true]]);
  const row=buildFieldRow('traits',{name:'Traits',valueType:'string',cardinality:'many'},[{id:'string'}]);
  assert.equal(row.valueTypeLabel,'Texte');assert.equal(row.cardinalityLabel,'plusieurs');
  assert.equal(buildEventFieldRow('n',{valueType:'integer'},[{id:'integer'}]).valueTypes[0].label,'Nombre entier');
  assert.match(renderCreationKindsOptions(['allocation'],'allocation'),/value="allocation" selected>Répartition de points</);
 }finally{globalThis.game=previous;}
});

test('a saved creation step shows its id to copy; a new one asks for a readable id',()=>{
 const text=(key,fallback)=>fallback,html=value=>renderCreationStepHTML({value,kinds:'',computed:{},sourceFamilies:'',sourcePicker:'',sourceDescriptor:{allowedLabel:'',help:''},uiText:text});
 const saved=html({id:'survie',name:'Survie',kind:'roll'});
 assert.match(saved,/<code>survie<\/code><button type="button" data-action="copyStepId" data-step-id="survie"/);
 assert.match(saved,/variables\.creation\.survie/);
 assert.doesNotMatch(saved,/data-step-prop="id"/);
 assert.match(html({name:'',kind:'choice'}),/<input data-step-prop="id" placeholder="Empty: taken from the step name">/);
});
