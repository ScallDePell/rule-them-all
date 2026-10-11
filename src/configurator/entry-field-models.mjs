/** Pure field-view models. No Foundry window, actor subtype or Ruleset mutation. */
import {refToken} from './reference-token.mjs';
import {formatEditorValue} from './editor-value.mjs';

export function buildFieldRow(id,field,valueTypes=[]){
  return {
    id,name:field.name??id,...field,
    valueTypes:valueTypes.map(type=>({id:type.id,selected:type.id===field.valueType})),
    isOne:field.cardinality!=="many",isMany:field.cardinality==="many",
    hasDefault:Object.hasOwn(field,"defaultValue"),
    defaultText:Object.hasOwn(field,"defaultValue")?formatEditorValue(field.valueType,field.cardinality,field.defaultValue):"",
    min:field.constraints?.find?.(c=>c?.kind==="min")?.value??"",max:field.constraints?.find?.(c=>c?.kind==="max")?.value??"",step:field.constraints?.find?.(c=>c?.kind==="step")?.value??"",
    isNumeric:["integer","number"].includes(field.valueType),
    constraintsJson:JSON.stringify((field.constraints??[]).filter(c=>!["min","max","step"].includes(c?.kind)),null,2),
    referenceTargetJson:field.referenceTarget?JSON.stringify(field.referenceTarget,null,2):"",
    referenceTargetKind:field.referenceTarget?.objectKind??"",
    refRoll:field.referenceTarget?.objectKind==="roll",refFormula:field.referenceTarget?.objectKind==="formula",refDefinition:field.referenceTarget?.objectKind==="definition",refParameter:field.referenceTarget?.objectKind==="parameter",refTest:field.referenceTarget?.objectKind==="test",refAction:field.referenceTarget?.objectKind==="action",refContent:field.referenceTarget?.objectKind==="contentTemplate",
    presentationJson:field.presentation?JSON.stringify(field.presentation,null,2):""
  };
}

export function buildEventFieldRow(id,field,valueTypes=[]){
  return {id,name:field?.name??id,valueType:field?.valueType??"string",required:field?.required===true,nullable:field?.nullable===true,description:field?.description??"",
    valueTypes:valueTypes.map(type=>({id:type.id,selected:type.id===(field?.valueType??"string")}))};
}

export function buildDefinitionFieldModel(id,field,data,creating,source="type",{referenceChoices=[]}={}){
  const hasValue=Object.hasOwn(data,id),hasDefault=Object.hasOwn(field,"defaultValue");
  const shown=hasValue?data[id]:(field.required&&hasDefault?field.defaultValue:undefined);
  return {
    id,label:field.name??id,source,...field,hasValue,hasDefault,optional:!field.required,
    valueText:field.valueType==="reference"&&field.cardinality==="one"?refToken(shown??{}):field.valueType==="reference"&&field.cardinality==="many"?"":formatEditorValue(field.valueType,field.cardinality,shown),
    trueSelected:shown===true,falseSelected:shown===false,nullSelected:shown===null,referenceChoices,
    isBoolean:field.valueType==="boolean"&&field.cardinality==="one",isNumber:["integer","number"].includes(field.valueType)&&field.cardinality==="one",isText:field.valueType==="string"&&field.cardinality==="one",isReference:field.valueType==="reference"&&field.cardinality==="one",isReferenceMany:field.valueType==="reference"&&field.cardinality==="many",isMany:field.cardinality==="many"&&field.valueType!=="reference",
    numberMin:field.constraints?.find?.(c=>c?.kind==="min")?.value??null,numberMax:field.constraints?.find?.(c=>c?.kind==="max")?.value??null,numberStep:field.constraints?.find?.(c=>c?.kind==="step")?.value??(field.valueType==="integer"?1:"any"),present:field.required||hasValue,
    inputRequired:field.required&&!field.nullable&&!hasDefault&&creating
  };
}
