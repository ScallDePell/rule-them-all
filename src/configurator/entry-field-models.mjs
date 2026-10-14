/** Pure field-view models. No Foundry window, actor subtype or Ruleset mutation. */
import {refToken} from './reference-token.mjs';
import {formatEditorValue} from './editor-value.mjs';
import {localizedText} from '../ui/ui-localization.mjs';

/** The word shown for a value type (RTA.ValueTypes.<id>); the stored value stays the id. */
const VALUE_TYPE_WORDS={integer:"Whole number",number:"Number",boolean:"Yes or no",string:"Text",reference:"Reference",duration:"Duration",dateTime:"Date and time"};
export const valueTypeLabel=id=>localizedText(`RTA.ValueTypes.${id}`,VALUE_TYPE_WORDS[id]??String(id??""));
/** Value type options for a select: {id, label, selected}. */
export const valueTypeChoices=(ids,selected,extra={})=>ids.map(id=>({id,label:valueTypeLabel(id),selected:id===selected,...extra}));
const cardinalityLabel=cardinality=>cardinality==="many"?localizedText("RTA.Template.Many","many"):localizedText("RTA.Template.One","one");

export function buildFieldRow(id,field,valueTypes=[],definitionTypes=[]){
  const kind=field.referenceTarget?.objectKind??"";
  return {
    id,name:field.name??id,...field,valueTypeLabel:valueTypeLabel(field.valueType),cardinalityLabel:cardinalityLabel(field.cardinality),
    valueTypes:valueTypeChoices(valueTypes.map(type=>type.id),field.valueType),
    isOne:field.cardinality!=="many",isMany:field.cardinality==="many",
    hasDefault:Object.hasOwn(field,"defaultValue"),
    defaultText:Object.hasOwn(field,"defaultValue")?formatEditorValue(field.valueType,field.cardinality,field.defaultValue):"",
    min:field.constraints?.find?.(c=>c?.kind==="min")?.value??"",max:field.constraints?.find?.(c=>c?.kind==="max")?.value??"",step:field.constraints?.find?.(c=>c?.kind==="step")?.value??"",
    isNumeric:["integer","number"].includes(field.valueType),isReference:field.valueType==="reference",
    refRoll:kind==="roll",refFormula:kind==="formula",refDefinition:kind==="definition",refParameter:kind==="parameter",refTest:kind==="test",refAction:kind==="action",refContent:kind==="contentTemplate",
    definitionTypeChoices:definitionTypes.map(type=>({id:type.id,label:type.nameKey||type.id,colors:type.colors??"",selected:type.id===field.referenceTarget?.definitionTypeId}))
  };
}

/** The blank row cloned by "Add field"; its id placeholder is replaced on insertion. */
export const NEW_FIELD_ID="__rta-new-field__";
export const buildNewFieldRow=(valueTypes=[],definitionTypes=[])=>({...buildFieldRow(NEW_FIELD_ID,{name:"",valueType:"integer",cardinality:"one"},valueTypes,definitionTypes),isNew:true});

export function buildEventFieldRow(id,field,valueTypes=[]){
  const valueType=field?.valueType??"string";
  return {id,name:field?.name??id,valueType,valueTypeLabel:valueTypeLabel(valueType),required:field?.required===true,nullable:field?.nullable===true,
    valueTypes:valueTypeChoices(valueTypes.map(type=>type.id),valueType)};
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
