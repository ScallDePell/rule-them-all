/** Field-form serialization isolated from the Foundry controller.
 * Readers accept DOM rows as input; they never access globals, saved Rulesets or game.
 */
import {parseEditorValue} from './editor-value.mjs';
import {parseRefToken} from './reference-token.mjs';
import {slug,free} from './entry-duplication.mjs';

export function collectFieldDefinitions(rows,{makeId}={}){
  const fields={};
  for(const row of rows){
    const get=name=>row.querySelector(`[data-field-prop="${name}"]`);
    const id=String(row.dataset.fieldId??get("id")?.value??"").trim()||(makeId?.()??"");
    if(!id)throw new Error('FieldDefinition requires an ID.');
    if(Object.hasOwn(fields,id))throw new Error(`Duplicate FieldDefinition id: ${id}.`);
    const name=String(get("name")?.value??"").trim();if(!name)throw new Error("Each FieldDefinition requires a name.");
    const valueType=String(get("valueType")?.value??"").trim(),cardinality=String(get("cardinality")?.value??"one"),nullable=get("nullable")?.checked===true;
    const constraints=[];
    if(["integer","number"].includes(valueType))for(const kind of ["min","max","step"]){const raw=String(get(kind)?.value??"").trim();if(raw!=="")constraints.push({kind,value:Number(raw)});}
    const field={id,name,valueType,cardinality,required:get("required")?.checked===true,nullable,constraints};
    // An empty default value means the field has no default.
    const defaultText=String(get("defaultValue")?.value??"");
    if(defaultText.trim()!=="")field.defaultValue=parseEditorValue(valueType,cardinality,nullable,defaultText);
    const objectKind=String(get("referenceTargetKind")?.value??"").trim();
    if(valueType==="reference"&&objectKind){
      const definitionTypeId=String(get("referenceDefinitionTypeId")?.value??"").trim();
      field.referenceTarget=objectKind==="definition"&&definitionTypeId?{objectKind,definitionTypeId}:{objectKind};
    }
    fields[id]=field;
  }
  return fields;
}

/** A new payload field (a row without id) takes an id slugged from its name, as Conditions read it (event.payload.<id>);
 * a saved field keeps its id. actionId and outcomeKey are what an Action always puts in the payload. */
export function collectEventPayloadFields(rows){
  const fields={},list=[...rows],taken=new Set(["actionId","outcomeKey",...list.map(row=>String(row.dataset.eventFieldId??"").trim()).filter(Boolean)]);
  for(const row of list){
    const get=name=>row.querySelector(`[data-event-field-prop="${name}"]`);
    const name=String(get("name")?.value??"").trim();if(!name)throw new Error("Each payload field requires a name.");
    let id=String(row.dataset.eventFieldId??"").trim();if(!id){id=free(slug(name)||"field",taken);taken.add(id);}
    fields[id]={name,valueType:String(get("valueType")?.value??"string"),required:get("required")?.checked===true,nullable:get("nullable")?.checked===true};
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
