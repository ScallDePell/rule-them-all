/** Pure formula/condition editor models. No Foundry, DOM, persistence or HTML. */
import {refToken} from "./reference-token.mjs";
/* Operand kinds of the visual builder: a value, a Parameter, a Formula, a Reference, a context path
   (variables.test.total), the dice of the roll, a distance between two roles, or Actors nearby. */
export const OPERAND_KINDS=Object.freeze(["literal","parameter","formula","reference","context","dice","distance","nearby"]);
export const OPERAND_ROLES=Object.freeze(["self","target","source"]);
const KIND_LABELS={literal:"Value",parameter:"Parameter",formula:"Formula",reference:"Reference",context:"Context value",dice:"Dice of the roll",distance:"Distance",nearby:"Actors nearby"};
const DICE_READ_LABELS={count:"Number of dice",sum:"Sum of the dice",highest:"Highest die",lowest:"Lowest die",size:"Dice thrown",matches:"Largest set of equal dice",counter:"Counter of the faces"};
const COMPARE_LABELS={any:"Of any value",eq:"Equal to",neq:"Other than",gt:"Above",gte:"At least",lt:"Below",lte:"At most"};
const SIDE_LABELS={any:"Anyone",ally:"Allies",enemy:"Enemies"};
const ROLE_LABELS={self:"Self",target:"Target",source:"Source"};
const isLiteral=node=>node?.type==="literal"&&(node.value===null||typeof node.value!=="object");
const astOperandKind=node=>OPERAND_KINDS.includes(node?.type)&&node.type!=="literal"?node.type:"literal";
/** Whether the builder can show this node as an operand without losing anything. */
export function isEditableOperand(node){
  const kind=node?.type;
  if(kind==="literal")return isLiteral(node);
  if(kind==="parameter"||kind==="formula")return typeof node.id==="string";
  if(kind==="reference")return node.reference!==null&&typeof node.reference==="object";
  if(kind==="context")return typeof node.path==="string";
  if(kind==="dice")return !node.compare||isLiteral(node.value);
  if(kind==="distance")return OPERAND_ROLES.includes(node.from)&&OPERAND_ROLES.includes(node.to);
  if(kind==="nearby")return OPERAND_ROLES.includes(node.of)&&isLiteral(node.within);
  return false;
}
const pick=(labels,selected,prefix,colors)=>Object.entries(labels).map(([id,fallback])=>({id,labelKey:`${prefix}.${id}`,fallback,colors,selected:id===selected}));
// Operand rows are rendered outside _prepareContext: inject the same color
// resolver used by the rest of the editor (never close over a local variable).
export const operandEditorRow=(node,index,{parameters=[],formulas=[],references=[],counters=[],neutral="",withColors=()=>({colors:""})}={})=>{
  const kind=astOperandKind(node), token=kind==="reference"?refToken(node?.reference??{}):"";
  const dice=kind==="dice"?node:{},distance=kind==="distance"?node:{},nearby=kind==="nearby"?node:{};
  return {index,operandLabel:`Operand ${index+1}`,kind,isLiteral:kind==="literal",isParameter:kind==="parameter",isFormula:kind==="formula",isReference:kind==="reference",
    isContext:kind==="context",isDice:kind==="dice",isDistance:kind==="distance",isNearby:kind==="nearby",
    kindChoices:OPERAND_KINDS.map(id=>({id,labelKey:`RTA.Operand.Kind.${id}`,fallback:KIND_LABELS[id],colors:neutral,selected:id===kind})),
    literalValue:kind==="literal"?String(node?.value??""):"",contextPath:kind==="context"?String(node.path??""):"",
    // Dice of the roll: what is read, in which group, which faces (a comparison) or which counter.
    diceReadChoices:pick(DICE_READ_LABELS,dice.read??"count","RTA.Operand.DiceRead",neutral),diceGroup:String(dice.group??""),diceIsCounter:dice.read==="counter",
    diceCompareChoices:pick(COMPARE_LABELS,dice.compare??"any","RTA.Operand.Compare",neutral),diceValue:dice.compare?String(dice.value?.value??""):"",
    diceCounterChoices:counters.map(counter=>({id:counter.id,label:counter.label||counter.id,colors:neutral,selected:counter.id===dice.counter})),
    distanceFromChoices:pick(ROLE_LABELS,distance.from??"self","RTA.Operand.Role",neutral),distanceToChoices:pick(ROLE_LABELS,distance.to??"target","RTA.Operand.Role",neutral),
    nearbyOfChoices:pick(ROLE_LABELS,nearby.of??"self","RTA.Operand.Role",neutral),nearbyWithin:kind==="nearby"?String(nearby.within?.value??""):"",
    nearbySideChoices:pick(SIDE_LABELS,nearby.side??"any","RTA.Operand.Side",neutral),
    parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:kind==="parameter"&&node?.id===x.id})),
    formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:kind==="formula"&&node?.id===x.id})),
    referenceChoices:references.map(x=>({...x,selected:kind==="reference"&&x.token===token}))};
};
const formulaFlags=operator=>({opSingle:operator==="single",opAdd:operator==="add",opSubtract:operator==="subtract",opMultiply:operator==="multiply",opDivide:operator==="divide",opMin:operator==="min",opMax:operator==="max",opSum:operator==="sum",opAverage:operator==="average"});
const conditionFlags=operator=>({opEq:operator==="eq",opNeq:operator==="neq",opGt:operator==="gt",opGte:operator==="gte",opLt:operator==="lt",opLte:operator==="lte",opAlwaysTrue:operator==="alwaysTrue",opAlwaysFalse:operator==="alwaysFalse",noOperands:CONSTANT_OPERATORS.includes(operator)});
/** Comparisons that ignore their operands. */
export const CONSTANT_OPERATORS=Object.freeze(["alwaysTrue","alwaysFalse"]);
export const simpleFormulaModel=(expression,sources)=>{
  const supported=new Set(["add","subtract","multiply","divide","min","max","sum","average"]);
  if(supported.has(expression?.type)&&Array.isArray(expression.args)&&expression.args.length&&expression.args.every(isEditableOperand)){const operator=expression.type;return {supported:true,operator,...formulaFlags(operator),operands:expression.args.map((n,i)=>operandEditorRow(n,i,sources))};}
  if(OPERAND_KINDS.includes(expression?.type)&&isEditableOperand(expression)){const operator="single";return {supported:true,operator,...formulaFlags(operator),operands:[operandEditorRow(expression,0,sources)]};}
  return {supported:false,operator:"single",...formulaFlags("single"),operands:[operandEditorRow({type:"literal",value:0},0,sources)]};
};
export const simpleConditionModel=(expression,sources)=>{
  const comparisons=new Set(["eq","neq","gt","gte","lt","lte"]);
  if(comparisons.has(expression?.type)&&isEditableOperand(expression.left)&&isEditableOperand(expression.right)){const operator=expression.type;return {supported:true,operator,...conditionFlags(operator),left:operandEditorRow(expression.left,0,sources),right:operandEditorRow(expression.right,1,sources)};}
  if(expression?.type==="literal"&&typeof expression.value==="boolean"){const operator=expression.value?"alwaysTrue":"alwaysFalse";return {supported:true,operator,...conditionFlags(operator),left:operandEditorRow({type:"literal",value:0},0,sources),right:operandEditorRow({type:"literal",value:0},1,sources)};}
  return {supported:false,operator:"eq",...conditionFlags("eq"),left:operandEditorRow({type:"literal",value:0},0,sources),right:operandEditorRow({type:"literal",value:0},1,sources)};
};
