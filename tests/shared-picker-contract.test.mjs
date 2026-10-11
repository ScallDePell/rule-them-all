import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const hbs=readFileSync(new URL("../templates/configurator/entry-editor.hbs",import.meta.url),"utf8");
const js=readFileSync(new URL("../src/configurator/configurator-entry-editor.mjs",import.meta.url),"utf8");
const picker=readFileSync(new URL("../src/ui/picker-markup.mjs",import.meta.url),"utf8");
test("all tag selectors reuse one inline partial across editor families",()=>{
  assert.equal((hbs.match(/#\*inline "rtaTagsPicker"/g)||[]).length,1);
  // Rule editors reach the tag picker through the shared Notes section.
  assert.ok((hbs.match(/{{> rtaTagsPicker}}/g)||[]).length+(hbs.match(/{{> rtaNotesSection}}/g)||[]).length>=8);
  assert.equal(hbs.split('placeholder=(localize "RTA.Template.SearchTags")').length-1,1);
});
test("dynamic checkbox options escape values and preserve checked state",()=>{
  assert.match(picker,/export const renderPickerOptions=/);
  assert.match(picker,/escape\(item.label\)/);
  assert.match(picker,/chosen.has\(item.id\)/);
});
test("creation source controls are checkboxes, not selects or collapsed details",()=>{
  const a=js.indexOf('#creationCheckboxList('),b=js.indexOf('#creationStepHTML(',a);
  const block=js.slice(a,b);
  assert.match(block,/renderCreationCheckboxPicker/);
  assert.match(picker,/renderChoiceListBody\(items/);
  assert.doesNotMatch(block,/<select|<details/);
});
