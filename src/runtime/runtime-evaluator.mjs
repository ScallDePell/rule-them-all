import {copyJSON, isRecord} from "../configurator/configurator-schema.mjs";
import {formulaNodeRegistry} from "../configurator/operation-registries.mjs";

export class RuntimeEvaluator {
  constructor({ruleset,resolveReference}) { this.ruleset=ruleset; this.resolveReference=resolveReference; }

  parameter(id){const p=this.ruleset.parameters?.find(x=>x.id===id&&x.enabled!==false);if(!p)throw new Error(`Parameter unavailable: ${id}.`);return copyJSON(p.value);}
  async formula(id,context,stack=new Set()){if(stack.has(id))throw new Error(`Formula cycle detected: ${id}.`);const f=this.ruleset.formulas?.find(x=>x.id===id&&x.enabled!==false);if(!f)throw new Error(`Formula unavailable: ${id}.`);const next=new Set(stack);next.add(id);return this.evaluate(f.expression,context,next);}
  async condition(id,context){const c=this.ruleset.conditions?.find(x=>x.id===id&&x.enabled!==false);if(!c)throw new Error(`Condition unavailable: ${id}.`);return Boolean(await this.evaluate(c.expression,context,new Set()));}

  /** Dispatch to the registered FormulaNodeType (CP-04). */
  async evaluate(node,context={},stack=new Set()){
    if(!isRecord(node)||typeof node.type!=="string") throw new Error("Invalid runtime AST node.");
    const type=formulaNodeRegistry.get(node.type);
    if(!type) throw new Error(`Runtime evaluator does not support AST node: ${node.type}.`);
    const kit={
      ev:n=>this.evaluate(n,context,stack),
      context,
      parameter:id=>this.parameter(id),
      formula:id=>this.formula(id,context,stack),
      reference:(reference,container=null)=>this.resolveReference(container?{container,reference}:reference,context,{forWrite:false})
    };
    return type.evaluate(node,kit);
  }
}
