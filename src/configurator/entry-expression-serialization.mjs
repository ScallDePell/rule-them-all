/** Expression form reader: DOM controls in, portable formula/condition AST out. */
import {parseRefToken} from './reference-token.mjs';
export function collectRuleOperand(row){
  const kind=String(row?.querySelector('[data-rule-operand-kind]')?.value??'literal');
  if(kind==='parameter'||kind==='formula')return {type:kind,id:String(row?.querySelector(`[data-rule-operand-editor="${kind}"] select`)?.value??'')};
  if(kind==='reference')return {type:'reference',reference:parseRefToken(row?.querySelector('[data-rule-operand-editor="reference"] select')?.value??'')};
  const raw=String(row?.querySelector('[data-rule-operand-editor="literal"] input')?.value??'').trim();
  if(raw==='true'||raw==='false')return {type:'literal',value:raw==='true'};
  const numeric=Number(raw);return {type:'literal',value:raw!==''&&Number.isFinite(numeric)?numeric:raw};
}
export function collectFormulaExpression(builder,fallback){
  if(!builder||builder.dataset.supported!=='true')return fallback;
  const operator=String(builder.querySelector('[name="formulaOperator"]')?.value??'single');
  const args=[...builder.querySelectorAll('[data-rule-operand]')].map(collectRuleOperand);
  if(operator==='single')return args[0]??{type:'literal',value:0};
  return {type:operator,args};
}
export function collectConditionExpression(builder,fallback){
  if(!builder||builder.dataset.supported!=='true')return fallback;
  const operator=String(builder.querySelector('[name="conditionOperator"]')?.value??'eq');
  if(operator==='alwaysTrue'||operator==='alwaysFalse')return {type:'literal',value:operator==='alwaysTrue'};
  const rows=[...builder.querySelectorAll('[data-rule-operand]')];
  return {type:operator,left:collectRuleOperand(rows[0]),right:collectRuleOperand(rows[1])};
}
