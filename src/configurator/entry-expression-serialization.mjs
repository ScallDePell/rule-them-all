/** Expression form reader: DOM controls in, form state (entry-expression-model) and portable formula/condition AST out. */
import {blockNodeOf,nodeOf} from './entry-expression-model.mjs';
const value=node=>String(node?.value??'');
/** The form state of one slot row; kind replaces the selected kind (the kind a row had before it changed). */
export function readSlotForm(row,kind=value(row?.querySelector(':scope > .rta-rule-operand__controls [data-rule-operand-kind]'))||'literal'){
  const own=selector=>row?.querySelector(`:scope > .rta-rule-operand__controls ${selector}`);
  const part=name=>value(own(`[data-rule-operand-editor="${kind}"] [data-operand-part="${name}"]`));
  if(kind==='literal')return {kind,value:part('value')};
  if(kind==='parameter'||kind==='formula')return {kind,id:part('id')};
  if(kind==='reference')return {kind,token:part('token'),container:part('container')};
  if(kind==='context')return {kind,path:part('path')};
  if(kind==='contentField')return {kind,field:part('field'),fallback:part('fallback')};
  if(kind==='dice')return {kind,read:part('read'),group:part('group'),compare:part('compare'),face:part('value'),counter:part('counter')};
  if(kind==='distance')return {kind,from:part('from'),to:part('to')};
  if(kind==='nearby')return {kind,of:part('of'),within:part('within'),side:part('side')};
  if(kind==='expression')return {kind,operation:value(own('[data-expr-operation]')),...readBlockForm(row?.querySelector(':scope > [data-expr-block]'))};
  return {kind:'none'};
}
/** The slots and rows of a block (its operation is read by the caller: the root select or the slot's own). */
export function readBlockForm(block){
  const rows=[...(block?.querySelectorAll(':scope > [data-expr-rows] > [data-expr-row]')??[])].map(row=>Object.fromEntries([...row.querySelectorAll('[data-row-part]')].map(input=>[input.dataset.rowPart,value(input)])));
  return {children:[...(block?.querySelectorAll(':scope > [data-rule-operand]')??[])].map(row=>readSlotForm(row)),rows};
}
/** The root form state of a builder. */
export const readRootForm=builder=>{const root=builder?.querySelector('[data-expr-root]');return {operation:value(root?.querySelector(':scope > .rta-form-row [data-expr-operation]')),...readBlockForm(root?.querySelector(':scope > [data-expr-block]'))};};
export const collectRuleOperand=row=>nodeOf(readSlotForm(row));
/** The expression of a Formula or Condition builder; an expression the builder cannot show keeps its technical JSON. */
export function collectExpression(builder,fallback){
  if(!builder||builder.dataset.supported!=='true')return fallback;
  return blockNodeOf(readRootForm(builder));
}
export const collectFormulaExpression=collectExpression,collectConditionExpression=collectExpression;
