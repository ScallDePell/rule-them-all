import test from "node:test";
import assert from "node:assert/strict";
import {formatEditorValue, parseEditorValue} from "../src/configurator/editor-value.mjs";

test("generic editor values round-trip primitive single values",()=>{
  assert.equal(parseEditorValue("integer","one",false,"12"),12);
  assert.equal(parseEditorValue("number","one",false,"1.25"),1.25);
  assert.equal(parseEditorValue("boolean","one",false,"false"),false);
  assert.equal(parseEditorValue("string","one",false,"Force"),"Force");
  assert.equal(parseEditorValue("string","one",true,"null"),null);
});

test("generic editor values round-trip primitive many values",()=>{
  assert.deepEqual(parseEditorValue("integer","many",false,"1\n2\n3"),[1,2,3]);
  assert.deepEqual(parseEditorValue("number","many",false,"1.5\n2"),[1.5,2]);
  assert.deepEqual(parseEditorValue("boolean","many",false,"true\nfalse"),[true,false]);
  assert.deepEqual(parseEditorValue("string","many",false,"alpha\nbeta"),["alpha","beta"]);
  assert.equal(formatEditorValue("integer","many",[1,2]),"1\n2");
});

test("generic editor rejects unsafe primitive coercions",()=>{
  assert.throws(()=>parseEditorValue("integer","one",false,"2.5"),/integer/);
  assert.throws(()=>parseEditorValue("boolean","one",false,"yes"),/true or false/);
  assert.throws(()=>parseEditorValue("number","many",false,"1\nnope"),/Line 2/);
});
