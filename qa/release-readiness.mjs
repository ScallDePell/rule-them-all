/** Release-closure gate for the architecture cleanup. This is intentionally
 * stricter than unit tests. A passing architecture audit does NOT mean RTA
 * is fully generic, translated, and ready for Foundry distribution.
 *
 * node qa/release-readiness.mjs [--json] [--strict]
 */
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const list=(path)=>readdirSync(join(root,path),{withFileTypes:true}).flatMap(item=>item.isDirectory()?list(join(path,item.name)):[join(path,item.name)]);
const localeKeys=value=>{
 const visit=(node,prefix)=>node&&typeof node==='object'&&!Array.isArray(node)
   ?Object.entries(node).flatMap(([key,v])=>visit(v,prefix?`${prefix}.${key}`:key))
   :[prefix];
 return new Set(visit(value,''));
};
const checks=[];
const add=(id,pass,explanation,evidence=[])=>checks.push({id,status:pass?'PASS':'OPEN',explanation,evidence});
const sourceFiles=list('src').filter(p=>p.endsWith('.mjs'));
const unownedMarkup=[];
for(const file of sourceFiles.filter(p=>!p.startsWith('src/ui/'))){
 const text=read(file);
 const count=[...text.matchAll(/<(?:article|button|details|div|input|label|option|select|span|textarea)\b/gi)].length;
 if(count)unownedMarkup.push({file,count});
}
add('presentation-boundary',unownedMarkup.length===0,
 'HTML for interface components must be generated in src/ui, never inline in domain/controller files.',unownedMarkup);
const dynamicUI=read('src/ui/entry-editor-markup.mjs');
const plainTexts=[...dynamicUI.matchAll(/>\s*([A-Za-z][A-Za-z0-9 .,\-/]*)\s*</g)]
 .map(x=>x[1].trim()).filter(x=>x.length>2);
const plainAttributes=[...dynamicUI.matchAll(/\b(?:title|placeholder|aria-label)="([A-Za-z][^"]+)"/g)].map(x=>x[1]);
const untranslated=[...new Set([...plainTexts,...plainAttributes])];
add('dynamic-markup-localization',untranslated.length===0,
 'Dynamic UI labels must use FR/EN locale keys; hard-coded display literals are not sufficient.',untranslated);
// Count raw visible text in every real Handlebars template. These are candidate
// occurrences, not distinct strings or a proof that each one must be translated.
const unlocalizedTemplates=[];
for(const file of list('templates').filter(p=>p.endsWith('.hbs'))){
 const template=read(file);
 const matches=[...template.matchAll(/<(?:label|summary|button|option|strong|h[1-6])\b[^>]*>\s*([^<{}\n]*[a-zA-Z][^<{}\n]*)\s*(?=<)/g)]
  .map(match=>match[1].trim()).filter(Boolean);
 if(matches.length)unlocalizedTemplates.push({file,occurrences:matches.length,samples:[...new Set(matches)].slice(0,24)});
}
add('handlebars-template-localization',unlocalizedTemplates.length===0,
 'All real editor/shell templates must use FR/EN keys for visible labels; a passing dynamic-markup audit alone is insufficient.',unlocalizedTemplates);
// The select component also contains default English UI strings; those should
// eventually be locale-backed without changing the public selector contract.
const selectJS=read('src/ui/rta-select.mjs');
const rawSelectPrompts=[...selectJS.matchAll(/(?:Select one or more |Select a |No options available\.)/g)].map(m=>m[0]);
add('select-core-localization',rawSelectPrompts.length===0,
 'The universal select must not assume English for its placeholder and empty state.',[...new Set(rawSelectPrompts)]);

const fr=localeKeys(JSON.parse(read('lang/fr.json')));
const en=localeKeys(JSON.parse(read('lang/en.json')));
const missingFR=[...en].filter(k=>!fr.has(k));
const missingEN=[...fr].filter(k=>!en.has(k));
add('locale-parity',missingFR.length===0&&missingEN.length===0,
 'French and English localization catalogs must expose the same keys.',{missingFR,missingEN});

// A large controller containing both domain normalization and DOM orchestration
// is not clean merely because all its string literals were moved out.
const editorController=read('src/configurator/configurator-entry-editor.mjs');
const remainingResponsibilities=['#fieldReferenceChoices(', '#definitionField(', '#seed(', '#collectFieldDefinitions(', '#collectDefinitionData(', '#collectRuleOperand(', '#collectCreationSteps('].filter(signature=>editorController.includes(signature));
if(!editorController.includes('return collectEntryData(this.#kind,'))remainingResponsibilities.push('missing canonical entry-data-collector delegation');
if(!editorController.includes('collectCreationSteps(this.element.querySelectorAll'))remainingResponsibilities.push('missing creation-step serialization delegation');
if(!editorController.includes('collectFormulaExpression(this.element.querySelector'))remainingResponsibilities.push('missing expression serialization delegation');
add('editor-responsibility-split',remainingResponsibilities.length===0,
 'The main editor controller should coordinate Foundry UI only; domain defaults, reference catalog choices and form serialization belong in separately testable units.',
 remainingResponsibilities.map(signature=>`src/configurator/configurator-entry-editor.mjs: ${signature}`));
// This is intentionally a sampled tripwire. A complete module-wide UI copy
// review is still required; a green result is not a guarantee of every string.
const residualCopy=['None selected','missing target','Create ${this.#kind}','Edit ${data.nameKey'];
const rawControllerCopy=residualCopy.filter(fragment=>editorController.includes(fragment));
add('controller-user-copy',rawControllerCopy.length===0,
 'Remaining user-facing fallback text in controllers must be localized (FR/EN) rather than assembled in English.',
 rawControllerCopy);


// A valid parser does not make a d20 or a difficulty of 13 generic rules.
// These defaults are present in multiple layers and need an end-to-end
// neutral initialization contract before they can be safely removed.
const rulesContract=read('src/configurator/rule-contracts.mjs');
const configApp=read('src/configurator/configurator-app.mjs');
const genericDefaultEvidence=[];
if(/formula:\s*["']1d20["']/.test(editorController))genericDefaultEvidence.push('configurator-entry-editor.mjs: new Roll defaults to 1d20');
if(/targetValue:\s*13\b/.test(editorController))genericDefaultEvidence.push('configurator-entry-editor.mjs: new Test defaults to threshold 13');
if(/formula:\s*["']1d20["']/.test(rulesContract))genericDefaultEvidence.push('rule-contracts.mjs: missing Roll formula defaults to 1d20');
if(/rollFormula:\s*["']1d20["']/.test(configApp))genericDefaultEvidence.push('configurator-app.mjs: Runtime Lab initializes with 1d20');
add('game-neutral-defaults',genericDefaultEvidence.length===0,
 'New rules and test fixtures must not silently choose d20 mechanics or a fixed difficulty; introduce neutral but valid initial states while preserving saved records.',genericDefaultEvidence);

const subtypeResolver=read('src/core/system-document-types.mjs');
const subtypeContract={
 uniqueOnly:/if\(types\.length===1\)return types\[0\]/.test(subtypeResolver),
 ambiguousRejected:/throw new Error\(`Select a subtype for \$\{documentName\} documents/.test(subtypeResolver),
 contentMapping:read('src/runtime/foundry-content-bridge.mjs').includes('contentType.documentSubtype'),
 runtimeMapping:read('src/configurator/configurator-app.mjs').includes('sourceType:this.#runtimeSelection.sourceType'),
 editorMapping:read('templates/configurator/entry-editor.hbs').includes('name="documentSubtypeActor"')&&read('templates/configurator/entry-editor.hbs').includes('name="documentSubtypeItem"'),
 runtimeUI:read('templates/configurator/configurator.hbs').includes('data-runtime-select="sourceType"')&&read('templates/configurator/configurator.hbs').includes('data-runtime-select="targetType"'),
 validated:read('src/configurator/rule-contracts.mjs').includes('ContentType.documentSubtype must be a string')
};
const unmapped=Object.entries(subtypeContract).filter(([key,ok])=>!ok).map(([key])=>key);
add('document-subtype-mapping',unmapped.length===0,
 'Multi-type Game Systems need an explicit selection on every relevant entry and Runtime Lab path; a uniquely advertised type may be inferred.',unmapped);
// Functional acceptance is a separate contract from architectural cleanliness.
// These gates are intentionally OPEN until a true Foundry-user workflow exists
// and an executable integrated acceptance scenario has been recorded.
add('creation-wizard-player-flow',false,
 'A player must be able to run every configured Creation System step from a Foundry UI; currently only a strict core for Definition/Content selections is implemented.',
 ['No end-user Creation wizard; allocation and schema-only sources are rejected intentionally.']);
add('acquisition-guided-choices',false,
 'Item acquisitions with required choices need a Foundry choice flow, not an unhandled post-create hook error.',
 ['Automatic createItem still cannot collect choiceGroups selections.']);
add('progression-engine',false,
 'Configured Progression Systems must be applied to an Actor with persisted results.',
 ['No generic Progression execution API or full lifecycle proof.']);
add('sheet-renderer',false,
 'Configured Sheet Definitions must render and update an actual Foundry Actor/Item sheet.',
 ['No registered Foundry Sheet Definition renderer.']);
add('business-permission-engine',false,
 'Configured Permission Policies must be evaluated at their declared operation boundaries.',
 ['Acquired Action grants are checked by a dedicated bridge entrypoint only; PermissionPolicy not integrated globally.']);
add('duration-lifecycle',false,
 'A configured Duration must drive lifecycle and expiry of runtime effects.',
 ['No Duration scheduler/resolution lifecycle.']);
// This cannot be certified in Node/Chromium. It MUST remain an explicit manual
// gate until evidence of a real Foundry 14 test campaign is recorded.
add('foundry-v14-integration',false,
 'Open, edit, save, reopen, export/import and Actor/Item integration must be confirmed in Foundry 14.',
 ['PENDING: user-maintained Foundry acceptance report']);
const open=checks.filter(c=>c.status==='OPEN');
const report={status:open.length?'NOT_READY':'READY',baseVersion:JSON.parse(read('module.json')).version,
  scope:'Architecture cleanup release, not merely automated test success',checks,
  summary:{passes:checks.length-open.length,open:open.length}};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
 console.log(`RTA release readiness: ${report.status}; ${report.summary.passes} passed; ${report.summary.open} OPEN`);
 for(const c of checks)console.log(` - ${c.status}: ${c.id} (${Array.isArray(c.evidence)?c.evidence.length:'see report'} indicator(s))`);
}
if(process.argv.includes('--strict')&&open.length)process.exitCode=1;
