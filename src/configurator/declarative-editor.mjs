/** Mapping between visible editor controls and declarative configuration. */
import {CONSTRAINT_KINDS,PRESENTATION_KEYS} from './declarative-contracts.mjs';
const numeric=new Set(['min','max','lengthMin','lengthMax','relationCount']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function constraintRowModel(rule={}) {
 const kind=CONSTRAINT_KINDS.includes(rule.kind)?rule.kind:'required';
 return {field:String(rule.field??''),value:(rule.kind==='fieldEquals'||rule.kind==='fieldNotEquals')?String(rule.otherField??''):rule.value===undefined?'':String(rule.value),kinds:CONSTRAINT_KINDS.map(id=>({id,colors:"#666666",selected:id===kind})),kind,legacy:false};
}
export function presentationRowModel(value) {
 const source=record(value)?value:{};
 return PRESENTATION_KEYS.map(key=>({key,active:Object.hasOwn(source,key),isBoolean:key==='visible',isColor:key==='color',isNumber:key==='order',value:source[key]===undefined||source[key]===null?'':String(source[key]),checked:source[key]===true}));
}
/** Unrecognized historic rules remain in the advanced JSON, never discarded. */
export function readConstraintRows(rows,legacy=[]) {
 const kept=Array.isArray(legacy)?legacy.filter(rule=>!record(rule)||!CONSTRAINT_KINDS.includes(rule.kind)):[];
 const result=[...kept];
 for(const row of rows) {
  const get=key=>row.querySelector(`[data-constraint-${key}]`)?.value;
  const kind=get('kind'),field=String(get('field')??'').trim();
  if(!CONSTRAINT_KINDS.includes(kind))throw new Error(`Unsupported constraint: ${kind}`);
  if(!field)throw new Error('A constraint field is required.');
  const rule={kind,field};
  if(kind==='fieldEquals'||kind==='fieldNotEquals')rule.otherField=String(get('value')??'').trim();
  else if(kind!=='required') {
   const raw=String(get('value')??'');
   if(numeric.has(kind)){if(!raw.trim()||!Number.isFinite(Number(raw)))throw new Error(`Numeric value required for ${kind}.`);rule.value=Number(raw);}
   else {try{rule.value=JSON.parse(raw);}catch{rule.value=raw;}}
  }
  result.push(rule);
 }
 return result;
}
export function readPresentationRows(rows,legacy=null) {
 const result=record(legacy)?structuredClone(legacy):{};
 for(const row of rows){
  const key=row.dataset.presentationKey;
  if(!PRESENTATION_KEYS.includes(key))continue;
  const active=row.querySelector('[data-presentation-override]')?.checked;
  if(!active){delete result[key];continue;}
  const control=row.querySelector('[data-presentation-value]');
  result[key]=key==='visible'?control.checked:key==='order'?Number(control.value):key==='color'?(control.value||null):control.value;
 }
 return Object.keys(result).length?result:null;
}
