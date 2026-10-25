import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {API_VERSION,STABLE_API} from '../src/core/module-contract.mjs';
import {COLLECTION_FIELDS} from '../src/configurator/configurator-schema.mjs';
import {kindOfCollection} from '../src/configurator/ruleset-parts.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
import {createRuntimeAPI} from '../src/runtime/runtime-api.mjs';
import {MemoryRuntimeAdapter} from '../src/runtime/memory-runtime-adapter.mjs';
import {startWorld} from './helpers/foundry-sim/world.mjs';

/* The stable API (STABLE_API, docs/architecture.md §6) is what other modules rely on. Removing or renaming a member
   fails here: if it is meant, it is a breaking change (API major, "Breaking:" in the CHANGELOG). */
const root=fileURLToPath(new URL('../',import.meta.url));
const pascal=text=>text[0].toUpperCase()+text.slice(1);
const missingFrom=(object,names)=>names.filter(name=>typeof object[name]!=='function');

test('stable API: the configurator offers its stable methods and the entry methods of every collection', async()=>{
  const api=await createConfiguratorAPI({load:async()=>emptyStorageSnapshot(),save:async()=>{}});
  assert.deepEqual(missingFrom(api,STABLE_API.configurator),[]);
  const entryMethods=COLLECTION_FIELDS.flatMap(collection=>{const kind=pascal(kindOfCollection(collection));
    return [`get${kind}`,`list${pascal(collection)}`,collection==='definitionTypes'?'registerDefinitionType':`create${kind}`,`update${kind}`,`delete${kind}`];});
  assert.deepEqual(missingFrom(api,entryMethods),[]);
});

test('stable API: the runtime offers its stable methods', async()=>{
  const api=await createConfiguratorAPI({load:async()=>emptyStorageSnapshot(),save:async()=>{}});
  assert.deepEqual(missingFrom(createRuntimeAPI(api,{adapter:new MemoryRuntimeAdapter(),hooks:null}),STABLE_API.runtime),[]);
});

test('stable API: every stable hook is fired by the module', ()=>{
  const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):entry.name.endsWith('.mjs')?[join(dir,entry.name)]:[]);
  const source=[join(root,'rule-them-all.mjs'),...files(join(root,'src'))].map(file=>readFileSync(file,'utf8')).join('\n');
  const contract=readFileSync(join(root,'src/core/module-contract.mjs'),'utf8');
  // Fired by name, or through the constant that holds the name (RUNTIME_HOOKS.x, REGISTER_TYPES_HOOK).
  const constantOf=hook=>[...contract.matchAll(/(\w+):"(ruleThemAll\w+)"/g)].find(match=>match[2]===hook)?.[1];
  const fired=hook=>source.includes(`callAll("${hook}"`)||source.includes(`callAll?.("${hook}"`)
    ||(constantOf(hook)&&new RegExp(`callAll\\??\\.?\\(\\s*RUNTIME_HOOKS\\.${constantOf(hook)}\\b`).test(source))
    ||(hook==='ruleThemAllRegisterTypes'&&/callAll\(REGISTER_TYPES_HOOK/.test(source))
    ||(hook==='ruleThemAllRegisterIntegrations'&&/callAll\(REGISTER_INTEGRATIONS_HOOK/.test(source))
    ||(hook==='ruleThemAllRulesetChanged'&&/callAll\(RULESET_CHANGED_HOOK/.test(source));
  assert.deepEqual(STABLE_API.hooks.filter(hook=>!fired(hook)),[]);
});

test('stable API: the architecture document names the API version and every stable member', ()=>{
  const doc=readFileSync(join(root,'docs/architecture.md'),'utf8');
  assert.match(API_VERSION,/^\d+\.\d+\.\d+$/);
  assert.ok(doc.includes(`API version **${API_VERSION}**`),'docs/architecture.md §6 states the current API_VERSION');
  const names=[...STABLE_API.members,...STABLE_API.configurator,...STABLE_API.runtime,...STABLE_API.chat,...STABLE_API.registries,...STABLE_API.integrations,...STABLE_API.hooks];
  assert.deepEqual(names.filter(name=>!new RegExp(`[\`.]${name}\\b`).test(doc)),[],'document these stable names in docs/architecture.md §6');
});

test('stable API: a Foundry client exposes game.ruleThemAll with its version and stable members', async t=>{
  const world=startWorld({users:[{_id:'gm',name:'GM',role:4}]});
  t.after(()=>world.close());
  const gm=await world.connect('gm');
  const seen=await gm.run(async({members})=>{
    const rta=game.ruleThemAll;
    return {apiVersion:rta.apiVersion,same:game.modules.get('rule-them-all').api===rta,missing:members.filter(name=>rta[name]===undefined),
      chat:typeof rta.chat.postActionCard,registries:Object.keys(rta.registries)};
  },{members:STABLE_API.members});
  assert.deepEqual(seen,{apiVersion:API_VERSION,same:true,missing:[],chat:'function',registries:[...STABLE_API.registries]});
  assert.deepEqual(gm.errors(),[]);
});
