import test from "node:test";
import assert from "node:assert/strict";
import {OPERATION_KINDS, prepareOperationPlan} from "../src/configurator/generic-operation-contract.mjs";

test("generic operation vocabulary is game-independent", () => {
  assert.deepEqual(OPERATION_KINDS, ["choose", "draw", "allocate", "check", "calculate", "assign", "spend", "trigger", "review"]);
});
test("proposed plan is preserved without changing unknown configuration", () => {
  const input={contractVersion:1, operations:[{id:"step1",kind:"allocate",config:{budget:{source:"formula",id:"budget"},custom:{nested:[1,2]}},when:{conditionId:"allowed"}}],extension:{future:true}};
  const result=prepareOperationPlan(input);
  assert.deepEqual(result,input);
  assert.notEqual(result,input);
  result.operations[0].config.custom.nested.push(3);
  assert.deepEqual(input.operations[0].config.custom.nested,[1,2]);
});
test("rejects invalid, duplicate, or unsupported operations", () => {
  const op={id:"a",kind:"choose",config:{}};
  assert.throws(()=>prepareOperationPlan({contractVersion:2,operations:[]}),/contractVersion/);
  assert.throws(()=>prepareOperationPlan({contractVersion:1,operations:[op,op]}),/Duplicate/);
  assert.throws(()=>prepareOperationPlan({contractVersion:1,operations:[{...op,kind:"gameSpecific"}]}),/known kind/);
  assert.throws(()=>prepareOperationPlan({contractVersion:1,operations:[{...op,when:{}}]}),/conditionId/);
});
