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
  assert.match(source,/selected\.length&&!chosen\.has\(input\)/);
});
