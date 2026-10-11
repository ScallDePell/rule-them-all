import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const editor=read("templates/configurator/entry-editor.hbs");
const shell=read("templates/configurator/configurator.hbs");
const js=read("src/configurator/configurator-entry-editor.mjs")+read("src/ui/entry-editor-markup.mjs");
const css=read("styles/configurator.css");
const count=(v,re)=>(v.match(re)||[]).length;
test("all relationship pickers use one shared search template",()=>{
 assert.equal(count(editor,/#\*inline "rtaPickerSearch"/g),1);
 assert.ok(count(editor,/{{> rtaPickerSearch placeholder=/g)>=10);
 assert.equal(count(editor,/<input type="search" data-picker-filter/g),1);
});
test("one renderer owns all JavaScript checkbox-list bodies",()=>{
 const picker=read("src/ui/picker-markup.mjs");
 assert.equal(count(picker,/export const renderChoiceListBody=/g),1);
 assert.equal(count(picker,/<div class="rta-picker__body rta-choice-list">/g),1);
 assert.match(js, /renderChoiceListBody\(options,\{name:'choiceTargetRef'/);
 assert.match(picker, /const body=renderChoiceListBody\(items/);
 assert.match(js, /renderCreationCheckboxPicker\(\{property,items,selected,single,emptyMessage\}\)/);
});
test("every checkbox option stack uses canonical list styling",()=>{
 assert.ok(count(editor,/rta-picker__body rta-choice-list/g)>=12);
 assert.match(editor,/rta-config-entry__check-group rta-choice-list/);
 assert.match(css,/\.rta-config-entry \.rta-choice-list > label \{/);
 assert.match(css,/--rta-choice-row-border/);
});
test("business cards remain distinct from plain checkbox rows",()=>{
 assert.match(editor,/data-definition-binding/);
 assert.match(js,/data-choice-group/);
 assert.match(css,/\.rta-binding-card\[data-definition-binding\]/);
});
test("other UI families remain: shell, actions, field editors, panels, tables, sheet builder, runtime",()=>{
 for(const token of ['rta-config-action','rta-config-card','rta-config-table','rta-dependencies','rta-runtime-lab'])assert.ok(shell.includes(token),token);
 for(const token of ['rta-field-editor','rta-form-stack','rta-config-entry__technical','rta-sheet-component','rta-rule-builder','rta-choice-list'])assert.ok(editor.includes(token)||js.includes(token),token);
});

test("icon-only sheet and acquisition actions reuse the shared icon action component",()=>{
 for(const action of ['sheetUp','sheetDown','removeSheetComponent','removeChoiceGroup']){
  const re=new RegExp(`<button type="button" class="rta-config-action" data-action="${action}"`);
  assert.match(editor+readFileSync(new URL("../src/ui/entry-editor-markup.mjs",import.meta.url),"utf8"),re);
  assert.match(js+read("src/ui/entry-editor-markup.mjs"),re);
 }
});
