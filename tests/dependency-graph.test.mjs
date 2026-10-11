import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDependencyExplorer,buildDependencyGraph} from '../src/configurator/dependency-explorer.mjs';
test('Dependency graph includes incoming and outgoing links, without mutating data',()=>{
  const ruleset={formulas:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]};
  const edges=[{consumerRef:{objectKind:'formula',objectId:'a'},targetRef:{objectKind:'formula',objectId:'b'},kind:'reference',path:'x'}, {consumerRef:{objectKind:'formula',objectId:'c'},targetRef:{objectKind:'formula',objectId:'a'},kind:'reference',path:'y'}];
  const groups=buildDependencyExplorer(ruleset,edges,e=>e.name);
  const graph=buildDependencyGraph(groups,'formula:a');
  assert.equal(graph.incomingCount,1);assert.equal(graph.outgoingCount,1);
  assert.equal(graph.nodes.length,3);assert.equal(graph.edges.length,2);
  assert.equal(graph.nodes.find(n=>n.key==='formula:b').selectable,false);
  assert.equal(graph.nodes.find(n=>n.key==='formula:c').selectable,true);
});
