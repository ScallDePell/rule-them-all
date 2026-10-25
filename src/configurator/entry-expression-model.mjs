/** Pure formula/condition editor models. No Foundry, DOM, persistence or HTML.
 * An expression is shown as nested blocks: a block is an operation and its slots, and a slot holds an operand
 * (a value, a Parameter, a Reference…) or a nested block (kind "expression"). The form state of a slot is plain
 * strings, as the controls hold them: formOf(node) reads an AST into it, nodeOf(form) writes it back, and the
 * builder only takes an expression that comes back unchanged (buildable). */
import {refToken,parseRefToken} from "./reference-token.mjs";
/* Operand kinds of the visual builder: a value, a Parameter, a Formula, a Reference, a context path
   (variables.test.total), a field of the Content the Action is used from (a weapon's ammunition), the dice of the
   roll, a distance between two roles, or Actors nearby. */
export const OPERAND_KINDS=Object.freeze(["literal","parameter","formula","reference","context","contentField","dice","distance","nearby"]);
export const OPERAND_ROLES=Object.freeze(["self","target","source"]);
/* Roles a Reference may be read on (runtime resolveContainer). "-" (never a role name) leaves the container out: the Reference
   is then read on the role the expression is evaluated for. */
export const REFERENCE_ROLES=Object.freeze(["self","target","source","owner","subject","leader","world","combat"]);
const KIND_LABELS={literal:"Value",parameter:"Parameter",formula:"Formula",reference:"Reference",context:"Context value",contentField:"Content field",dice:"Dice of the roll",distance:"Distance",nearby:"Actors nearby",expression:"Calculation",none:"None"};
const DICE_READ_LABELS={count:"Number of dice",sum:"Sum of the dice",highest:"Highest die",lowest:"Lowest die",size:"Dice thrown",matches:"Largest set of equal dice",counter:"Counter of the faces"};
const COMPARE_LABELS={any:"Of any value",eq:"Equal to",neq:"Other than",gt:"Above",gte:"At least",lt:"Below",lte:"At most"};
const SIDE_LABELS={any:"Anyone",ally:"Allies",enemy:"Enemies"};
const ROLE_LABELS={self:"Self",target:"Target",source:"Source"};
const REFERENCE_ROLE_LABELS={"-":"Evaluated Actor",self:"Self",target:"Target",source:"Source",owner:"Owner",subject:"Subject",leader:"Group leader",world:"World",combat:"Combat in progress"};
/* Operations by shape: args (operands added at will), duo (two fixed operands), value (one), pair (left, right),
   clamp, if, range (rangeLookup) and table (lookup), which also hold rows and an optional default. */
const SHAPES={add:"args",subtract:"args",multiply:"args",divide:"args",min:"args",max:"args",sum:"args",average:"args",and:"args",or:"args",
  mod:"duo",floor:"value",ceil:"value",round:"value",not:"value",clamp:"clamp",if:"if",rangeLookup:"range",lookup:"table",
  eq:"pair",neq:"pair",gt:"pair",gte:"pair",lt:"pair",lte:"pair",single:"single",alwaysTrue:"none",alwaysFalse:"none"};
const SLOTS={duo:["value","divisor"],value:["value"],pair:["left","right"],clamp:["value","minimum","maximum"],if:["if","then","else"],range:["value","default"],table:["key","default"],single:["value"],none:[]};
const OPERATION_LABELS={single:"Single value",add:"Add",subtract:"Subtract",multiply:"Multiply",divide:"Divide",mod:"Remainder of a division",min:"Minimum",max:"Maximum",sum:"Sum",average:"Average",
  floor:"Round down",ceil:"Round up",round:"Round to nearest",clamp:"Keep between two values",if:"If… then… else",rangeLookup:"Table of ranges",lookup:"Table of values",
  eq:"Equals",neq:"Not equal",gt:"Greater than",gte:"Greater or equal",lt:"Less than",lte:"Less or equal",and:"And (all true)",or:"Or (at least one true)",not:"Not (the opposite)",alwaysTrue:"Always true",alwaysFalse:"Always false"};
const SLOT_LABELS={operand:"Operand",value:"Value",divisor:"Divisor",left:"Operand 1",right:"Operand 2",minimum:"Minimum",maximum:"Maximum",if:"If",then:"Then",else:"Else",key:"Key",default:"Otherwise"};
const ARITHMETIC=["add","subtract","multiply","divide","mod","min","max","sum","average","floor","ceil","round","clamp"];
const LOGIC=["eq","neq","gt","gte","lt","lte","and","or","not"];
/** Operations offered by an editor: its root (Single value, Always true…) or a nested block. */
export const editorOperations=(editor,root)=>editor==="condition"
  ?[...LOGIC,"if",...(root?["single","alwaysTrue","alwaysFalse"]:[]),...ARITHMETIC,"rangeLookup","lookup"]
  :[...(root?["single"]:[]),...ARITHMETIC,"if","rangeLookup","lookup",...LOGIC];
/** Comparisons that ignore their operands. */
export const CONSTANT_OPERATORS=Object.freeze(["alwaysTrue","alwaysFalse"]);

/* Literal text: a number, true/false, or any other text. */
export const parseLiteral=raw=>{const text=String(raw??"").trim();if(text==="true"||text==="false")return text==="true";const n=Number(text);return text!==""&&Number.isFinite(n)?n:text;};
const text=value=>value===undefined||value===null?"":String(value);
const number=(raw,label)=>{const t=String(raw??"").trim(),n=Number(t);if(t===""||!Number.isFinite(n))throw new Error(`${label} must be a number.`);return n;};
const bound=raw=>String(raw??"").trim()===""?undefined:number(raw,"A range bound");
const lit=value=>({type:"literal",value});
const isRecord=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(key,v)=>isRecord(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);

/** Form state of a slot (strings, as the controls hold them), or null when the builder cannot show the node. */
export function formOf(node){
  if(!isRecord(node))return null;
  const t=node.type;
  if(t==="literal")return isRecord(node.value)||Array.isArray(node.value)?null:{kind:"literal",value:text(node.value)};
  if(t==="parameter"||t==="formula")return {kind:t,id:text(node.id)};
  if(t==="reference")return isRecord(node.reference)?{kind:"reference",token:refToken(node.reference),container:text(node.container)}:null;
  if(t==="context")return {kind:"context",path:text(node.path)};
  // Its value when the Content has no such field: a plain value only.
  if(t==="contentField")return node.default===undefined?{kind:"contentField",field:text(node.field),fallback:""}:node.default?.type==="literal"&&!isRecord(node.default.value)&&!Array.isArray(node.default.value)?{kind:"contentField",field:text(node.field),fallback:text(node.default.value)}:null;
  if(t==="dice")return {kind:"dice",read:text(node.read),group:text(node.group),compare:text(node.compare),face:node.compare?text(node.value?.value):"",counter:text(node.counter)};
  if(t==="distance")return {kind:"distance",from:text(node.from),to:text(node.to)};
  if(t==="nearby")return {kind:"nearby",of:text(node.of),within:text(node.within?.value),side:text(node.side)};
  const block=blockFormOf(node);return block?{kind:"expression",...block}:null;
}
/** Form state of a block (an operation, its slots and rows). */
export function blockFormOf(node){
  const operation=node?.type,shape=SHAPES[operation];
  if(!shape||shape==="single"||shape==="none")return null;
  const of=child=>child===undefined?{kind:"none"}:formOf(child);
  let children,rows=[];
  if(shape==="args")children=Array.isArray(node.args)?node.args.map(formOf):[null];
  else if(shape==="duo")children=Array.isArray(node.args)&&node.args.length===2?node.args.map(formOf):[null];
  else if(shape==="range"){children=[formOf(node.value),of(node.default)];rows=Array.isArray(node.ranges)?node.ranges.map(r=>({min:text(r?.min),max:text(r?.max),value:text(r?.value)})):[];}
  else if(shape==="table"){children=[formOf(node.key),of(node.default)];rows=Array.isArray(node.table)?node.table.map(r=>({key:text(r?.key),value:text(r?.value)})):[];}
  else children={value:["value"],pair:["left","right"],clamp:["value","min","max"],if:["condition","then","else"]}[shape].map(key=>formOf(node[key]));
  return children.length&&children.every(Boolean)?{operation,children,rows}:null;
}
/** The AST of a slot's form state; throws when a number is missing. */
export function nodeOf(form){
  const k=form?.kind;
  if(k==="parameter"||k==="formula")return {type:k,id:form.id};
  if(k==="reference"){const ref=parseRefToken(form.token);return form.container&&form.container!=="-"?{type:"reference",reference:ref,container:form.container}:{type:"reference",reference:ref};}
  if(k==="context")return {type:"context",path:form.path.trim()};
  if(k==="contentField"){const fallback=String(form.fallback??"").trim();return {type:"contentField",field:String(form.field??"").trim(),...(fallback===""?{}:{default:lit(parseLiteral(fallback))})};}
  if(k==="distance")return {type:"distance",from:form.from||"self",to:form.to||"target"};
  if(k==="nearby")return {type:"nearby",of:form.of||"self",within:lit(number(form.within,"The distance of nearby Actors")),side:form.side||"any"};
  if(k==="dice"){
    const read=form.read||"count",node={type:"dice",read,...(form.group.trim()?{group:form.group.trim()}:{})};
    if(read==="counter")return {...node,counter:form.counter};
    const compare=form.compare==="any"?"":form.compare;
    return compare?{...node,compare,value:lit(number(form.face,"The compared die value"))}:node;
  }
  if(k==="expression")return blockNodeOf(form);
  return lit(parseLiteral(form?.value));
}
/** The AST of a block's form state; a root Single value is its operand, Always true/false a boolean. */
export function blockNodeOf({operation,children=[],rows=[]}){
  const shape=SHAPES[operation],[a,b,c]=children.map(child=>child?.kind==="none"?undefined:child&&nodeOf(child));
  if(shape==="none")return lit(operation==="alwaysTrue");
  if(shape==="single")return a??lit(0);
  if(shape==="args")return {type:operation,args:children.map(nodeOf)};
  if(shape==="duo")return {type:operation,args:[a,b]};
  if(shape==="value")return {type:operation,value:a};
  if(shape==="pair")return {type:operation,left:a,right:b};
  if(shape==="clamp")return {type:operation,value:a,min:b,max:c};
  if(shape==="if")return {type:operation,condition:a,then:b,else:c};
  if(shape==="range")return {type:operation,value:a,ranges:rows.map(r=>{const min=bound(r.min),max=bound(r.max);return {...(min===undefined?{}:{min}),...(max===undefined?{}:{max}),value:parseLiteral(r.value)};}),...(b===undefined?{}:{default:b})};
  if(shape==="table")return {type:operation,key:a,table:rows.map(r=>({key:parseLiteral(r.key),value:parseLiteral(r.value)})),...(b===undefined?{}:{default:b})};
  throw new Error(`Unknown operation: ${operation}.`);
}
/** Root form state of a Formula or Condition, or null when the builder would change it. */
export function rootFormOf(expression,editor){
  if(editor==="condition"&&expression?.type==="literal"&&typeof expression.value==="boolean"&&Object.keys(expression).length===2)return {operation:expression.value?"alwaysTrue":"alwaysFalse",children:[],rows:[]};
  const block=blockFormOf(expression),form=block??(OPERAND_KINDS.includes(expression?.type)?{operation:"single",children:[formOf(expression)],rows:[]}:null);
  if(!form||form.children.some(child=>!child))return null;
  try{return canonical(blockNodeOf(form))===canonical(expression)?form:null;}catch{return null;}
}
/** Whether the builder shows this expression without changing it. */
export const buildable=(expression,editor="formula")=>Boolean(rootFormOf(expression,editor));

/** Default children of an operation, keeping the operands already there (a block whose operation changes). */
export function reshapeBlock(operation,children=[],rows=[]){
  const shape=SHAPES[operation],kept=children.filter(child=>child&&child.kind!=="none"),zero=()=>({kind:"literal",value:"0"});
  const take=n=>Array.from({length:n},(_,i)=>kept[i]??zero());
  if(shape==="none")return {operation,children:[],rows:[]};
  if(shape==="args")return {operation,children:take(Math.max(2,kept.length)),rows:[]};
  if(shape==="range")return {operation,children:[...take(1),{kind:"none"}],rows:rows.length&&"min" in rows[0]?rows:[{min:"",max:"",value:"0"}]};
  if(shape==="table")return {operation,children:[...take(1),{kind:"none"}],rows:rows.length&&"key" in rows[0]?rows:[{key:"",value:"0"}]};
  return {operation,children:take(SLOTS[shape].length),rows:[]};
}
export const blockShape=operation=>SHAPES[operation]??"";

const pick=(labels,selected,prefix,colors)=>Object.entries(labels).map(([id,fallback])=>({id,labelKey:`${prefix}.${id==="-"?"default":id}`,fallback,colors,selected:id===selected}));
// Operand rows are rendered outside _prepareContext: inject the same color
// resolver used by the rest of the editor (never close over a local variable).
/** View of one slot: its kind and the controls of each kind, from its form state. */
export function slotView(form,{label,path="",optional=false,removable=false,editor="formula"},sources={}){
  const {parameters=[],formulas=[],references=[],contentFields=[],counters=[],roles=[],neutral="",withColors=()=>({colors:""})}=sources;
  const kind=form?.kind??"literal",f={kind,...form},kinds=[...OPERAND_KINDS,"expression",...(optional?["none"]:[])];
  // A nested block is drawn only for a calculation; choosing Calculation later draws a fresh one.
  const block=kind==="expression"?blockView(f,{path,editor},sources):null;
  return {label,path,removable,kind,isExpression:kind==="expression",block,editor,
    kindChoices:kinds.map(id=>({id,labelKey:`RTA.Operand.Kind.${id}`,fallback:KIND_LABELS[id],colors:neutral,selected:id===kind})),
    show:Object.fromEntries(kinds.map(id=>[id,id===kind])),
    literalValue:kind==="literal"?f.value??"":"0",contextPath:kind==="context"?f.path:"",
    // Fields of the Ruleset's Content Types; a field no type has any more stays shown, as it is written.
    contentFieldChoices:[...contentFields,...(kind==="contentField"&&f.field&&!contentFields.some(x=>x.id===f.field)?[{id:f.field,label:f.field}]:[])]
      .map(x=>({id:x.id,label:x.label||x.id,colors:neutral,selected:kind==="contentField"&&x.id===f.field})),contentFieldFallback:kind==="contentField"?f.fallback??"":"",
    // Dice of the roll: what is read, in which group, which faces (a comparison) or which counter.
    diceReadChoices:pick(DICE_READ_LABELS,f.read||"count","RTA.Operand.DiceRead",neutral),diceGroup:kind==="dice"?f.group:"",diceIsCounter:kind==="dice"&&f.read==="counter",
    diceCompareChoices:pick(COMPARE_LABELS,f.compare||"any","RTA.Operand.Compare",neutral),diceValue:kind==="dice"?f.face:"",
    diceCounterChoices:counters.map(counter=>({id:counter.id,label:counter.label||counter.id,colors:neutral,selected:counter.id===f.counter})),
    distanceFromChoices:pick(ROLE_LABELS,f.from||"self","RTA.Operand.Role",neutral),distanceToChoices:pick(ROLE_LABELS,f.to||"target","RTA.Operand.Role",neutral),
    nearbyOfChoices:pick(ROLE_LABELS,f.of||"self","RTA.Operand.Role",neutral),nearbyWithin:kind==="nearby"?f.within:"",
    nearbySideChoices:pick(SIDE_LABELS,f.side||"any","RTA.Operand.Side",neutral),
    parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:kind==="parameter"&&f.id===x.id})),
    formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:kind==="formula"&&f.id===x.id})),
    referenceChoices:references.map(x=>({...x,id:x.token,selected:kind==="reference"&&x.token===f.token})),
    // The Actor the Reference is read on; roles linked by Actions (the pilot's vehicle) come last, by name.
    referenceRoleChoices:[...pick(REFERENCE_ROLE_LABELS,kind==="reference"&&f.container||"-","RTA.Operand.ReferenceRole",neutral),
      ...[...new Set([...roles,...(kind==="reference"&&f.container&&!(f.container in REFERENCE_ROLE_LABELS)?[f.container]:[])])].map(id=>({id,label:id,colors:neutral,selected:kind==="reference"&&f.container===id}))]};
}
/** View of a block: its operation choices, its slots and its rows. */
export function blockView({operation,children=[],rows=[]},{path="",editor="formula",root=false},sources={}){
  const shape=SHAPES[operation],at=key=>root?key:`${path}.${key}`;
  const slotPaths=shape==="args"?children.map((_,i)=>at(`args[${i}]`)):shape==="duo"?[at("args[0]"),at("args[1]")]:shape==="single"?[path]
    :({value:["value"],pair:["left","right"],clamp:["value","min","max"],if:["condition","then","else"],range:["value","default"],table:["key","default"]}[shape]??[]).map(at);
  const names=shape==="args"?children.map(()=>"operand"):SLOTS[shape]??[];
  const slots=children.map((child,i)=>slotView(child,{label:{key:`RTA.Expression.Slot.${names[i]}`,fallback:SLOT_LABELS[names[i]],number:shape==="args"?i+1:null},
    path:slotPaths[i],optional:(shape==="range"||shape==="table")&&i===1,removable:shape==="args"&&children.length>1,editor},sources));
  return {operation,shape,isArgs:shape==="args",isRange:shape==="range",isTable:shape==="table",
    operationChoices:editorOperations(editor,root).map(id=>({id,labelKey:`RTA.Expression.Operation.${id}`,fallback:OPERATION_LABELS[id],colors:sources.neutral??"",selected:id===operation})),
    // The value slot comes first, then the rows, then the default.
    leadSlots:shape==="range"||shape==="table"?slots.slice(0,1):slots,trailSlots:shape==="range"||shape==="table"?slots.slice(1):[],
    rows:rows.map((row,i)=>({...row,path:at(`${shape==="range"?"ranges":"table"}[${i}]`),removable:rows.length>1}))};
}
/** The whole builder of a Formula or Condition: supported (the visual blocks) or only the technical JSON. */
export function expressionBuilderModel(expression,editor,sources){
  const form=rootFormOf(expression,editor);
  return {supported:Boolean(form),editor,root:form?blockView(form,{editor,root:true},sources):null};
}

/* Paths the engine fills in the evaluation context (runtime-engine, creation-plan, foundry-sheets), each with a hint key. */
const STATIC_CONTEXT_PATHS=[
  ["variables.test.total","TestTotal"],["variables.test.natural","TestNatural"],["variables.test.rollTotal","TestRollTotal"],["variables.test.bonus","TestBonus"],
  ["variables.test.target","TestTarget"],["variables.test.margin","TestMargin"],["variables.test.outcome.resultKey","TestOutcome"],["variables.test.opposed.total","OpposedTotal"],
  ["variables.reroll.count","RerollCount"],["variables.table.total","TableTotal"],
  ["variables.group.count","GroupCount"],["variables.group.best","GroupBest"],["variables.group.worst","GroupWorst"],["variables.group.sum","GroupSum"],
  ["variables.each.definitionId","EachDefinition"],["variables.allocation.point","AllocationPoint"],["variables.allocation.definitionId","AllocationDefinition"],
  ["variables.advance.current","AdvanceCurrent"],["variables.advance.next","AdvanceNext"],["variables.term.index","TermIndex"],["variables.term.count","TermCount"]];
/** Suggested context paths: the fixed ones, then those named by this Ruleset (Action and Test inputs, creation steps,
 * Outcome keys counted by group Tests, event fields). Each is {value, hintKey, name?}. */
export function contextPathSuggestions(ruleset={}){
  const live=list=>(list??[]).filter(x=>x&&x.enabled!==false),out=new Map(),add=(value,hintKey,name="")=>{if(!out.has(value))out.set(value,{value,hintKey:`RTA.ContextPath.${hintKey}`,name:String(name??"")});};
  for(const [value,hint] of STATIC_CONTEXT_PATHS)add(value,hint);
  for(const action of live(ruleset.actions))for(const input of action.inputs??[])add(`variables.input.${input.id}`,"ActionInput",input.labelKey||input.id);
  for(const test of live(ruleset.tests))for(const input of test.inputBindings??[])add(`variables.test.inputs.${input.id}`,"TestInput",input.id);
  for(const system of live(ruleset.creationSystems))for(const step of system.steps??[]){add(`variables.creation.${step.id}.count`,"CreationCount",step.name||step.id);add(`variables.creation.${step.id}.total`,"CreationTotal",step.name||step.id);}
  for(const outcome of live(ruleset.outcomes))if(outcome.resultKey)add(`variables.group.outcomes.${outcome.resultKey}`,"GroupOutcome",outcome.resultKey);
  for(const type of live(ruleset.eventTypes))for(const [id,field] of Object.entries(type.payloadFields??{}))add(`event.payload.${id}`,"EventPayload",`${type.nameKey||type.id} · ${field?.name||id}`);
  return [...out.values()];
}
