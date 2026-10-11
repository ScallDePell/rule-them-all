/** Pure formula/condition editor models. No Foundry, DOM, persistence or HTML. */
import {refToken} from "./reference-token.mjs";
const astOperandKind=node=>node?.type==="parameter"?"parameter":node?.type==="formula"?"formula":node?.type==="reference"?"reference":"literal";
// Operand rows are rendered outside _prepareContext: inject the same color
// resolver used by the rest of the editor (never close over a local variable).
export const operandEditorRow=(node,index,{parameters=[],formulas=[],references=[],withColors=()=>({colors:""})}={})=>{
  const kind=astOperandKind(node), token=kind==="reference"?refToken(node?.reference??{}):"";
  return {index,operandLabel:`Operand ${index+1}`,kind,isLiteral:kind==="literal",isParameter:kind==="parameter",isFormula:kind==="formula",isReference:kind==="reference",
    literalValue:kind==="literal"?String(node?.value??""):"",
    parameterChoices:parameters.map(x=>({id:x.id,label:x.nameKey,...withColors("parameter",x),selected:kind==="parameter"&&node?.id===x.id})),
    formulaChoices:formulas.map(x=>({id:x.id,label:x.nameKey,...withColors("formula",x),selected:kind==="formula"&&node?.id===x.id})),
    referenceChoices:references.map(x=>({...x,selected:kind==="reference"&&x.token===token}))};
};
const formulaFlags=operator=>({opSingle:operator==="single",opAdd:operator==="add",opSubtract:operator==="subtract",opMultiply:operator==="multiply",opDivide:operator==="divide",opMin:operator==="min",opMax:operator==="max",opSum:operator==="sum",opAverage:operator==="average"});
const conditionFlags=operator=>({opEq:operator==="eq",opNeq:operator==="neq",opGt:operator==="gt",opGte:operator==="gte",opLt:operator==="lt",opLte:operator==="lte",opAlwaysTrue:operator==="alwaysTrue",opAlwaysFalse:operator==="alwaysFalse"});
export const simpleFormulaModel=(expression,sources)=>{
  const supported=new Set(["add","subtract","multiply","divide","min","max","sum","average"]);
  if(supported.has(expression?.type)&&Array.isArray(expression.args)&&expression.args.length){const operator=expression.type;return {supported:true,operator,...formulaFlags(operator),operands:expression.args.map((n,i)=>operandEditorRow(n,i,sources))};}
  if(["literal","parameter","formula","reference"].includes(expression?.type)){const operator="single";return {supported:true,operator,...formulaFlags(operator),operands:[operandEditorRow(expression,0,sources)]};}
  return {supported:false,operator:"single",...formulaFlags("single"),operands:[operandEditorRow({type:"literal",value:0},0,sources)]};
};
export const simpleConditionModel=(expression,sources)=>{
  const comparisons=new Set(["eq","neq","gt","gte","lt","lte"]);
  if(comparisons.has(expression?.type)&&expression.left&&expression.right){const operator=expression.type;return {supported:true,operator,...conditionFlags(operator),left:operandEditorRow(expression.left,0,sources),right:operandEditorRow(expression.right,1,sources)};}
  if(expression?.type==="literal"&&typeof expression.value==="boolean"){const operator=expression.value?"alwaysTrue":"alwaysFalse";return {supported:true,operator,...conditionFlags(operator),left:operandEditorRow({type:"literal",value:0},0,sources),right:operandEditorRow({type:"literal",value:0},1,sources)};}
  return {supported:false,operator:"eq",...conditionFlags("eq"),left:operandEditorRow({type:"literal",value:0},0,sources),right:operandEditorRow({type:"literal",value:0},1,sources)};
};
