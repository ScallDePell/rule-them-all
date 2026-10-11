import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConstraintContract,evaluateConstraints,resolvePresentation,validatePresentationContract} from '../src/configurator/declarative-contracts.mjs';
test('declarative constraints validate and execute without mutation',()=>{
 const rules=[{kind:'min',field:'score',value:1},{kind:'max',field:'score',value:5},{kind:'required',field:'label'}];
 const data={score:6,label:'ok'};const before=structuredClone(data);
 assert.equal(validateConstraintContract(rules).length,0);
 assert.deepEqual(evaluateConstraints(rules,data).map(x=>x.code),['CONSTRAINT_VIOLATION']);
 assert.deepEqual(data,before);
});
test('unknown declarative constraints fail explicitly',()=>{
 assert.equal(validateConstraintContract([{kind:'magicalThreshold',field:'score',value:5}])[0].code,'CONSTRAINT_UNKNOWN');
 assert.equal(evaluateConstraints([{kind:'magicalThreshold',field:'score'}],{score:2})[0].code,'CONSTRAINT_UNKNOWN');
});
test('presentation inheritance honors explicit false and cannot grant access',()=>{
 const type={visible:true,label:'Default',color:'#666666',extraHistorical:{keep:true}};
 const value=resolvePresentation(type,{visible:false,label:'Specific'}, {color:'#123456'},{canRead:false,canWrite:false});
 assert.deepEqual(value,{visible:false,label:'Specific',color:'#123456',editable:false});
 assert.equal(type.extraHistorical.keep,true);
 assert.equal(validatePresentationContract({color:'red'})[0].code,'PRESENTATION_VALUE');
});
test('relation cardinality is checked explicitly',()=>{
 assert.equal(evaluateConstraints([{kind:'relationCount',field:'relations',value:2}],{relations:[{}]}).length,1);
});
import {readConstraintRows,readPresentationRows,presentationRowModel} from '../src/configurator/declarative-editor.mjs';
import {createConfiguratorAPI} from '../src/configurator/configurator-api.mjs';
import {emptyStorageSnapshot} from '../src/configurator/configurator-storage.mjs';
const mockRule=(kind,field,value)=>({querySelector:selector=>({
 '[data-constraint-kind]':{value:kind},'[data-constraint-field]':{value:field},'[data-constraint-value]':{value}
}[selector])});
test('visual constraint editor serializes numeric and comparison rules',()=>{
 const data=readConstraintRows([mockRule('min','score','2'),mockRule('fieldEquals','other','score')]);
 assert.deepEqual(data,[{kind:'min',field:'score',value:2},{kind:'fieldEquals',field:'other',otherField:'score'}]);
 assert.equal(evaluateConstraints(data,{score:2,other:2}).length,0);
});
test('presentation keeps only the overrides that are switched on',()=>{
 const rows=presentationRowModel({label:'Override',visible:false});
 assert.equal(rows.find(row=>row.key==='visible').active,true);
 const off=[{dataset:{presentationKey:'label'},querySelector:selector=>selector==='[data-presentation-override]'?{checked:false}:{value:'Ignore'}}];
 assert.equal(readPresentationRows(off),null);
 const on=[{dataset:{presentationKey:'label'},querySelector:selector=>selector==='[data-presentation-override]'?{checked:true}:{value:'Shown'}}];
 assert.deepEqual(readPresentationRows(on),{label:'Shown'});
});
class Store {constructor(){this.value=emptyStorageSnapshot();}async load(){return structuredClone(this.value);}async save(v){this.value=structuredClone(v);}}
test('Configurator rejects invalid values at persistence and preserves inherited metadata after reload',async()=>{
 const api=await createConfiguratorAPI(new Store());
 const version=(await api.createRuleset({id:'generic-contract',nameKey:'Neutral',version:'1.0.0'})).versionId;
 const type={id:'generic-type',key:'generic-type',nameKey:'Generic Type',allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{amount:{id:'amount',name:'Amount',valueType:'number',cardinality:'one',required:true,nullable:false}},constraints:[{kind:'min',field:'amount',value:1}],presentation:{label:'Base',color:'#666666'}};
 await api.registerDefinitionType(version,type);
 await assert.rejects(()=>api.createDefinition(version,{id:'bad',key:'bad',nameKey:'Bad',definitionTypeId:'generic-type',data:{amount:0},capabilities:[],categories:[],tags:[]}),/constraint|min|Invalid Ruleset/i);
 await api.createDefinition(version,{id:'good',key:'good',nameKey:'Good',definitionTypeId:'generic-type',data:{amount:2},capabilities:[],categories:[],tags:[],presentationProfile:{label:'Specific'}});
 const actual=api.getDefinition(version,'good');
 assert.equal(resolvePresentation(api.getDefinitionType(version,'generic-type').presentation,actual.presentationProfile).label,'Specific');
});
