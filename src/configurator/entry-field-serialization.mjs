/** Field-form serialization isolated from the Foundry controller.
 * Readers accept DOM rows as input; they never access globals, saved Rulesets or game.
 */
import {parseEditorValue} from './editor-value.mjs';
import {parseRefToken} from './reference-token.mjs';

const json=(value,fallback)=>{const text=String(value??"").trim();return text?JSON.parse(text):fallback;};
export function collectFieldDefinitions(rows,{makeId}={}){
  const fields={};
  for(const row of rows){
    const get=name=>row.querySelector(`[data-field-prop="${name}"]`);
    const id=String(row.dataset.fieldId??get("id")?.value??"").trim()||(makeId?.()??"");
    if(!id)throw new Error('FieldDefinition requires an ID.');
    if(Object.hasOwn(fields,id))throw new Error(`Duplicate FieldDefinition id: ${id}.`);
    const name=String(get("name")?.value??"").trim();if(!name)throw new Error("Each FieldDefinition requires a name.");
    const valueType=String(get("valueType")?.value??"").trim(),cardinality=String(get("cardinality")?.value??"one"),nullable=get("nullable")?.checked===true;
    const constraints=json(get("constraints")?.value,[]);
    for(const kind of ["min","max","step"]){const raw=String(get(kind)?.value??"").trim();if(raw!=="")constraints.push({kind,value:Number(raw)});}
    const field={id,name,valueType,cardinality,required:get("required")?.checked===true,nullable,constraints,editable:get("editable")?.checked===true};
    const description=String(get("description")?.value??"");if(description)field.description=description;
    if(get("hasDefault")?.checked===true)field.defaultValue=parseEditorValue(valueType,cardinality,nullable,get("defaultValue")?.value??"");
    const referenceKind=String(get("referenceTargetKind")?.value??"").trim();
    const referenceText=String(get("referenceTarget")?.value??"").trim();
    // Preserve the advanced reference constraints when changing the reference kind.
    const advancedTarget=referenceText?json(referenceText,null):null;
    if(advancedTarget!==null&&(typeof advancedTarget!=="object"||Array.isArray(advancedTarget)))throw new Error(`Invalid reference target for field ${name}.`);
    if(advancedTarget||referenceKind){
      const target={...(advancedTarget??{})};
      if(referenceKind)target.objectKind=referenceKind;
      if(target.objectKind!=="definition")delete target.definitionTypeId;
      field.referenceTarget=target;
    }
    const presentationText=String(get("presentation")?.value??"").trim();if(presentationText)field.presentation=json(presentationText,null);
    fields[id]=field;
  }
  return fields;
}

export function collectEventPayloadFields(rows,{makeId}={}){
  const fields={};
  for(const row of rows){
    const get=name=>row.querySelector(`[data-event-field-prop="${name}"]`);
    const id=String(row.dataset.eventFieldId??"").trim()||(makeId?.()??"");
    if(!id)throw new Error('Event payload field requires an ID.');
    const name=String(get("name")?.value??"").trim();if(!name)throw new Error("Each payload field requires a name.");
    fields[id]={name,valueType:String(get("valueType")?.value??"string"),required:get("required")?.checked===true,nullable:get("nullable")?.checked===true};
    const description=String(get("description")?.value??"").trim();if(description)fields[id].description=description;
  }
  return fields;
}

export function collectDefinitionData(rows){
  const data={};
  for(const row of rows){
    const id=row.dataset.definitionField,valueType=row.dataset.valueType,cardinality=row.dataset.cardinality,nullable=row.dataset.nullable==="true",required=row.dataset.required==="true";
    const input=row.querySelector("[data-field-value]");
    if(valueType==="reference"&&cardinality==="many"){
      const selected=[...(input?.selectedOptions??[])].map(option=>parseRefToken(option.value));
      if(required||selected.length)data[id]=selected;
      continue;
    }
    const raw=String(input?.value??"");
    const present=required||raw.trim()!=="";if(!present)continue;
    data[id]=valueType==="reference"&&cardinality==="one"?parseRefToken(raw):parseEditorValue(valueType,cardinality,nullable,raw);
  }
  return data;
}
