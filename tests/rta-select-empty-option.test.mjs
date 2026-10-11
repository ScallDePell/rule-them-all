import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/ui/rta-select.mjs",import.meta.url),"utf8");
test("single-select empty native options remain in form but never become checkbox choices",()=>{
  assert.match(source,/if\(!this\.multiple&&option\.value===""\)continue;/);
  assert.match(source,/input\.dataset\.rtaNativeIndex=String\(index\)/);
  assert.match(source,/const option=opts\[Number\(input\.dataset\.rtaNativeIndex\)\]/);
});
test("unchecking single choice restores original empty sentinel without losing events",()=>{
  assert.match(source,/native\.selectedIndex=\[\.\.\.native\.options\]\.findIndex\(option=>option\.value===""\)/);
  assert.match(source,/emit\(native\)/);
});
test("single-select keeps every option selectable: a new choice replaces the current one",()=>{
  // Disabling the other options forced users to uncheck before switching.
  assert.doesNotMatch(source,/selected\.length&&!chosen\.has\(input\)/);
  assert.match(source,/input\.disabled=!!\(this\.native\.disabled\|\|this\.native\.options\[idx\]\?\.disabled\);/);
});

test('§46.8: every RTA Select shows an explicit cardinality', async () => {
  const {selectCardinality, CARDINALITY_KEYS} = await import('../src/ui/select-text.mjs');
  const native = (values, {required = false} = {}) => ({required, options: values.map(value => ({value}))});
  assert.equal(selectCardinality({native: native(['', 'a'])}), '0..1');
  assert.equal(selectCardinality({native: native(['a', 'b'])}), '1');
  assert.equal(selectCardinality({multiple: true, native: native(['a'])}), '0..n');
  assert.equal(selectCardinality({multiple: true, native: native(['a'], {required: true})}), '1..n');
  assert.equal(selectCardinality({multiple: true}), '0..n');
  assert.equal(selectCardinality({radios: true}), '1');
  assert.equal(selectCardinality({explicit: '1..n'}), '1..n');
  assert.deepEqual(Object.keys(CARDINALITY_KEYS), ['1', '0..1', '1..n', '0..n']);
});
