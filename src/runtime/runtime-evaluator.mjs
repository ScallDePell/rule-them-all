import {copyJSON, isRecord} from "../configurator/configurator-schema.mjs";

const args=node=>Array.isArray(node.args)?node.args:[];
const num=(v,label)=>{const n=Number(v);if(!Number.isFinite(n))throw new Error(`${label} must resolve to a finite number.`);return n;};

export class RuntimeEvaluator {
  constructor({ruleset,resolveReference}) { this.ruleset=ruleset; this.resolveReference=resolveReference; }

  parameter(id){const p=this.ruleset.parameters?.find(x=>x.id===id&&x.enabled!==false);if(!p)throw new Error(`Parameter unavailable: ${id}.`);return copyJSON(p.value);}
  async formula(id,context,stack=new Set()){if(stack.has(id))throw new Error(`Formula cycle detected: ${id}.`);const f=this.ruleset.formulas?.find(x=>x.id===id&&x.enabled!==false);if(!f)throw new Error(`Formula unavailable: ${id}.`);const next=new Set(stack);next.add(id);return this.evaluate(f.expression,context,next);}
  async condition(id,context){const c=this.ruleset.conditions?.find(x=>x.id===id&&x.enabled!==false);if(!c)throw new Error(`Condition unavailable: ${id}.`);return Boolean(await this.evaluate(c.expression,context,new Set()));}

  async evaluate(node,context={},stack=new Set()){
    if(!isRecord(node)||typeof node.type!=="string") throw new Error("Invalid runtime AST node.");
    const ev=n=>this.evaluate(n,context,stack);
    switch(node.type){
      case "literal": return copyJSON(node.value);
      case "parameter": return this.parameter(node.id);
      case "formula": return this.formula(node.id,context,stack);
      case "context": {let value=context;for(const part of String(node.path??"").split(".").filter(Boolean))value=value?.[part];return value===undefined?undefined:copyJSON(value);}
      case "reference": return this.resolveReference(node.reference,context,{forWrite:false});
      case "add": {let out=0;for(const n of args(node))out+=num(await ev(n),"add operand");return out;}
      case "subtract": {const a=args(node);if(!a.length)return 0;let out=num(await ev(a[0]),"subtract operand");for(const n of a.slice(1))out-=num(await ev(n),"subtract operand");return out;}
      case "multiply": {let out=1;for(const n of args(node))out*=num(await ev(n),"multiply operand");return out;}
      case "divide": {const a=args(node);if(!a.length)return 0;let out=num(await ev(a[0]),"divide operand");for(const n of a.slice(1)){const d=num(await ev(n),"divide operand");if(d===0)throw new Error("Division by zero.");out/=d;}return out;}
      case "min": {const values=[];for(const n of args(node))values.push(num(await ev(n),"min operand"));return Math.min(...values);}
      case "max": {const values=[];for(const n of args(node))values.push(num(await ev(n),"max operand"));return Math.max(...values);}
      case "sum": {let out=0;for(const n of args(node))out+=num(await ev(n),"sum operand");return out;}
      case "average": {const a=args(node);if(!a.length)return 0;let out=0;for(const n of a)out+=num(await ev(n),"average operand");return out/a.length;}
      case "round": return Math.round(num(await ev(node.value??node.arg),"round operand"));
      case "floor": return Math.floor(num(await ev(node.value??node.arg),"floor operand"));
      case "ceil": return Math.ceil(num(await ev(node.value??node.arg),"ceil operand"));
      case "clamp": return Math.min(num(await ev(node.max),"clamp max"),Math.max(num(await ev(node.min),"clamp min"),num(await ev(node.value),"clamp value")));
      case "eq": return (await ev(node.left))===(await ev(node.right));
      case "neq": return (await ev(node.left))!==(await ev(node.right));
      case "gt": return (await ev(node.left))>(await ev(node.right));
      case "gte": return (await ev(node.left))>=(await ev(node.right));
      case "lt": return (await ev(node.left))<(await ev(node.right));
      case "lte": return (await ev(node.left))<=(await ev(node.right));
      case "and": {for(const n of args(node))if(!Boolean(await ev(n)))return false;return true;}
      case "or": {for(const n of args(node))if(Boolean(await ev(n)))return true;return false;}
      case "not": return !Boolean(await ev(node.value??node.arg));
      case "if": return Boolean(await ev(node.condition))?ev(node.then):ev(node.else);
      case "lookup": {const key=await ev(node.key);const row=node.table.find(r=>r.key===key);if(row)return copyJSON(row.value);if(node.default!==undefined)return ev(node.default);throw new Error(`Lookup has no entry for key: ${JSON.stringify(key)}.`);}
      case "rangeLookup": {const value=num(await ev(node.value),"rangeLookup value");const row=node.ranges.find(r=>(r.min==null||value>=r.min)&&(r.max==null||value<=r.max));if(row)return copyJSON(row.value);if(node.default!==undefined)return ev(node.default);throw new Error(`Range lookup has no range for value: ${value}.`);}
      default: throw new Error(`Runtime evaluator does not support AST node: ${node.type}.`);
    }
  }
}
