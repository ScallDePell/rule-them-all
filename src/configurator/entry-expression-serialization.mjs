/** Expression form reader: DOM controls in, portable formula/condition AST out. */
import {parseRefToken} from './reference-token.mjs';
export function collectRuleOperand(row){
  const kind=String(row?.querySelector('[data-rule-operand-kind]')?.value??'literal');
  if(kind==='parameter'||kind==='formula')return {type:kind,id:String(row?.querySelector(`[data-rule-operand-editor="${kind}"] select`)?.value??'')};
  if(kind==='reference')return {type:'reference',reference:parseRefToken(row?.querySelector('[data-rule-operand-editor="reference"] select')?.value??'')};
  const part=name=>String(row?.querySelector(`[data-rule-operand-editor="${kind}"] [data-operand-part="${name}"]`)?.value??'').trim();
  const number=(name,label)=>{const value=Number(part(name));if(part(name)===''||!Number.isFinite(value))throw new Error(`${label} must be a number.`);return {type:'literal',value};};
  if(kind==='context')return {type:'context',path:part('path')};
  if(kind==='distance')return {type:'distance',from:part('from')||'self',to:part('to')||'target'};
  if(kind==='nearby')return {type:'nearby',of:part('of')||'self',within:number('within','The distance of nearby Actors'),side:part('side')||'any'};
  if(kind==='dice'){
    const read=part('read')||'count',group=part('group'),node={type:'dice',read,...(group?{group}:{})};
    if(read==='counter')return {...node,counter:part('counter')};
    const compare=part('compare')==='any'?'':part('compare');
    return compare?{...node,compare,value:number('value','The compared die value')}:node;
  }
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
