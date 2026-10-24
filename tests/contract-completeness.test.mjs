import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COLLECTION_FIELDS} from '../src/configurator/configurator-schema.mjs';
import {readRulesetPayload, exportRulesetData} from '../src/configurator/configurator-serialization.mjs';
import {DependencyIndex} from '../src/configurator/dependency-index.mjs';
import * as impact from '../src/configurator/change-impact.mjs';
import * as parts from '../src/configurator/ruleset-parts.mjs';
import {PART_FAMILY_KEYS} from '../src/configurator/ruleset-part-view.mjs';
import {isSystemEventType} from '../src/configurator/system-events.mjs';
import {formulaNodeRegistry, effectOperationRegistry} from '../src/configurator/operation-registries.mjs';
import {valueTypeRegistry} from '../src/configurator/value-type-registry.mjs';
import {capabilityTypeRegistry} from '../src/configurator/capability-type-registry.mjs';
import {blockShape, editorOperations, OPERAND_KINDS} from '../src/configurator/entry-expression-model.mjs';
import {convertRuleset} from '../src/configurator/stored-data-repair.mjs';

/* A new reference, operation, capability or stored field must reach every part of the module that handles its kind:
   dependencies (deletion, parts, renames), the visual editor, both languages, export and import, the repair. Each test
   below fails with the place to complete. The shipped Rulesets (Rulesets/) are the corpus: a field they use is checked. */
const root=new URL('../',import.meta.url);
const SHIPPED=['Rulesets/rwf/rwf-ruleset-2.6.0.json','Rulesets/srd-5.2/srd-5.2-ruleset-1.0.0.json'].map(path=>({path,payload:readRulesetPayload(JSON.parse(readFileSync(new URL(path,root),'utf8')))}));
const rulesetOf=({payload})=>payload.record.publishedSnapshot;
const locales=Object.fromEntries(['en','fr'].map(lang=>[lang,JSON.parse(readFileSync(new URL(`lang/${lang}.json`,root),'utf8'))]));
const hasKey=(key,dict)=>key.split('.').reduce((node,part)=>node?.[part],dict)!==undefined;
const missingLabels=keys=>Object.entries(locales).flatMap(([lang,dict])=>keys.filter(key=>!hasKey(key,dict)).map(key=>`${lang}: ${key}`));

/** Fields holding an entry id under another name than *Ref. */
const ID_REFERENCES=new Set(['outcomeId','definitionTypeId','contentTypeId','contentTypeIds','definitionId','templateId','eventTypeId']);
/** Places where such a name is not a reference to an entry of the Ruleset. */
const NOT_REFERENCES=[
  /^triggers\[\d+\]\.eventTypeId$/,              // a module event (rta.combat.turn) when isSystemEventType: checked below
  /\.expression\b.*\.definitionId$/              // inside a Formula, read at run time
];
const blank=value=>value===null||value===undefined||value===''||(Array.isArray(value)&&!value.length);

/** Every path of a Ruleset that names another entry: *Ref and *Refs fields, {objectKind, objectId} objects, id fields. */
function referencePaths(ruleset){
  const out=[];
  const walk=(value,path)=>{
    if(Array.isArray(value))return value.forEach((item,i)=>walk(item,`${path}[${i}]`));
    if(!value||typeof value!=='object')return;
    if(typeof value.objectKind==='string'&&typeof value.objectId==='string'&&!/Refs?(\[\d+\])?$/.test(path))out.push(path);
    for(const [key,item] of Object.entries(value)){
      const at=path?`${path}.${key}`:key;
      if(!blank(item)&&/Refs?$/.test(key))out.push(at);
      else if(!blank(item)&&ID_REFERENCES.has(key)&&!NOT_REFERENCES.some(re=>re.test(at))&&!(key==='eventTypeId'&&isSystemEventType(item)))out.push(at);
      walk(item,at);
    }
  };
  walk(ruleset,'');
  return out;
}

test('contract: every reference in the shipped Rulesets is known to the DependencyIndex (deletion, parts, renames)', ()=>{
  for(const shipped of SHIPPED){
    const ruleset=rulesetOf(shipped),edges=new Set(new DependencyIndex(ruleset).list().map(edge=>edge.path));
    // A path is covered by an edge at it, inside it (a reference object's own fields) or around it (a list of ids).
    const ancestors=path=>[...path.matchAll(/[.[]/g)].map(match=>path.slice(0,match.index));
    const around=new Set([...edges].flatMap(ancestors));
    const covered=path=>edges.has(path)||around.has(path)||ancestors(path).some(prefix=>edges.has(prefix));
    const missing=[...new Set(referencePaths(ruleset).filter(path=>!covered(path)).map(path=>path.replace(/\[\d+\]/g,'[]')))];
    assert.deepEqual(missing,[],`${shipped.path}: add these references to src/configurator/dependency-index.mjs`);
  }
});

test('contract: every object kind a dependency names resolves to its collection, the same way everywhere', ()=>{
  for(const collection of COLLECTION_FIELDS){
    const kind=parts.kindOfCollection(collection);
    assert.equal(impact.kindOfCollection(collection),kind,`change-impact.mjs and ruleset-parts.mjs name the entries of ${collection} differently`);
    assert.equal(impact.collectionOfKind(kind),collection,`change-impact.mjs cannot find ${kind}`);
    assert.equal(parts.collectionOfKind(kind),collection,`ruleset-parts.mjs cannot find ${kind}`);
  }
  for(const shipped of SHIPPED){
    const ruleset=rulesetOf(shipped);
    const kinds=new Set(new DependencyIndex(ruleset).list().flatMap(edge=>[edge.consumerRef.objectKind,edge.targetRef.objectKind]));
    // The Ruleset itself consumes some entries (its initiative): it is no collection.
    assert.deepEqual([...kinds].filter(kind=>kind!=='ruleset'&&!impact.collectionOfKind(kind)),[],`${shipped.path}: dependency kinds without a collection`);
  }
  // Deleting any entry can be analysed: the candidate Ruleset is built for every kind.
  const ruleset=rulesetOf(SHIPPED[0]);
  for(const collection of COLLECTION_FIELDS){const entry=(ruleset[collection]??[])[0];if(entry)assert.doesNotThrow(()=>impact.rulesetWithout(ruleset,parts.kindOfCollection(collection),entry.id),collection);}
});

test('contract: every collection has its family name in both languages', ()=>{
  assert.deepEqual(COLLECTION_FIELDS.filter(collection=>!PART_FAMILY_KEYS[collection]),[],'add the family to PART_FAMILY_KEYS (ruleset-part-view.mjs)');
  assert.deepEqual(missingLabels(COLLECTION_FIELDS.map(collection=>PART_FAMILY_KEYS[collection])),[]);
});

/** Formula nodes the visual editor does not build: written by import, the API or a part. Keep this list short. */
const NOT_IN_VISUAL_EDITOR=new Set(['definitionValue','definitionField','contentAggregate','contentField']);

test('contract: every Formula node is either built by the visual editor or listed as API-only', ()=>{
  const missing=formulaNodeRegistry.list().filter(id=>!blockShape(id)&&!OPERAND_KINDS.includes(id)&&!NOT_IN_VISUAL_EDITOR.has(id));
  assert.deepEqual(missing,[],'give the node a shape in entry-expression-model.mjs (SHAPES or OPERAND_KINDS), or list it in NOT_IN_VISUAL_EDITOR');
  for(const id of NOT_IN_VISUAL_EDITOR)assert.ok(formulaNodeRegistry.has(id),`${id} is no longer a Formula node: remove it from NOT_IN_VISUAL_EDITOR`);
});

test('contract: every operation, operand kind, value type and capability has its words in both languages', ()=>{
  const operations=new Set(['formula','condition'].flatMap(editor=>[true,false].flatMap(rootLevel=>editorOperations(editor,rootLevel))));
  assert.deepEqual(missingLabels([
    ...[...operations].map(id=>`RTA.Expression.Operation.${id}`),
    ...OPERAND_KINDS.map(id=>`RTA.Operand.Kind.${id}`),
    ...effectOperationRegistry.list().map(id=>effectOperationRegistry.get(id).labelKey),
    ...valueTypeRegistry.list().map(type=>`RTA.ValueTypes.${type.id??type}`),
    ...capabilityTypeRegistry.list().map(type=>`RTA.CapabilityType.${type.id??type}`)
  ]),[]);
});

test('contract: the shipped Rulesets survive export and import, and the repair leaves current data as it is', ()=>{
  for(const shipped of SHIPPED){
    const {record,worldLocalizations}=shipped.payload;
    const again=readRulesetPayload(JSON.parse(JSON.stringify(exportRulesetData(record,{worldLocalizations}))));
    assert.deepEqual(again.record,record,`${shipped.path}: a field is lost or changed by export/import (configurator-serialization.mjs)`);
    assert.deepEqual(again.worldLocalizations,worldLocalizations);
    const {ruleset}=convertRuleset(rulesetOf(shipped));
    assert.deepEqual(ruleset,rulesetOf(shipped),`${shipped.path}: the repair (stored-data-repair.mjs) changes current data`);
  }
});
