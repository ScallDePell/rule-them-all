import {parseRefToken} from './reference-token.mjs';
import {normalizeRelation} from './generic-relations.mjs';

/** Content Template UI -> portable acquisition contract.
 * Updates only fields that the visible form edits; unexposed stored properties
 * are preserved. Do not replace the persisted aggregate with UI defaults.
 */
export function collectTemplateAcquisitions({current={},definitionRows=[],choiceRows=[],actionIds=[],uid}={}){
  const previousDefinitions=new Map((current.definitionBindings??[]).map(binding=>[binding.definitionId,binding]));
  const definitionBindings=[];
  for(const row of definitionRows){
    const id=String(row.dataset?.definitionBinding??'').trim();
    if(!id)throw new Error('Definition binding requires an id.');
    if(!row.querySelector('[name="templateDefinitionRefs"]')?.checked)continue;
    const previous=previousDefinitions.get(id)??{};
    const initial={...(previous.initial??{})};
    // value.base and one "pool.<slot>.current" per pool slot of the Definition.
    for(const input of row.querySelectorAll('input[type="number"][data-binding-slot]')){
      const slot=input.dataset.bindingSlot;
      const raw=String(input.value??'').trim();
      if(!raw){delete initial[slot];continue;}
      const value=Number(raw);
      if(!Number.isFinite(value))throw new Error(`Invalid numeric initial value for ${id}/${slot}.`);
      initial[slot]=value;
    }
    const active=row.querySelector('[data-binding-slot="state.active"]');
    if(active)initial['state.active']=active.checked===true;
    definitionBindings.push({...previous,id:previous.id??`definition-${id}`,definitionId:id,initial});
  }
  const previousActions=new Map((current.actionBindings??[]).map(binding=>[binding.actionId,binding]));
  const actionBindings=[...new Set(actionIds)].map(id=>{
    const value=String(id??'').trim();if(!value)throw new Error('Action binding requires an id.');
    return previousActions.get(value)??{id:`action-${value}`,actionId:value};
  });
  const previousGroups=new Map((current.choiceGroups??[]).map(group=>[group.id,group]));
  const choiceGroups=[...choiceRows].map(row=>{
    const id=String(row.dataset?.choiceGroup??uid?.('choice')??'').trim();
    if(!id)throw new Error('Acquisition choice requires an id.');
    const previous=previousGroups.get(id)??{};
    const name=String(row.querySelector('[data-choice-prop="name"]')?.value??'').trim();
    const min=Number(row.querySelector('[data-choice-prop="min"]')?.value??1);
    const max=Number(row.querySelector('[data-choice-prop="max"]')?.value??1);
    const operation=String(row.querySelector('[data-choice-prop="operation"]')?.value??'grant');
    const preserveOptionOperations=Boolean(row.dataset?.choiceInitialOperation) && row.dataset.choiceInitialOperation===operation;
    const oldOptions=new Map((previous.options??[]).map(option=>{
      const target=option.targetRef??(option.kind==='definition'?{objectKind:'definition',objectId:option.definitionId}:option.kind==='action'?{objectKind:'action',objectId:option.actionId}:null);
      return [target?`${target.objectKind}:${target.objectId}`:'',option];
    }));
    const options=[];
    for(const input of row.querySelectorAll('[name="choiceTargetRef"]:checked')){
      const targetRef=parseRefToken(input.value);
      if(!targetRef.objectKind||!targetRef.objectId)throw new Error(`Acquisition choice ${id} has an invalid reference.`);
      const key=`${targetRef.objectKind}:${targetRef.objectId}`;
      const previousOption=oldOptions.get(key)??{};
      // Migrate historical Definition/Action options WITHOUT losing their
      // initial values or unknown extension metadata. Legacy runtime keys are
      // removed to avoid executing the award twice during the transition.
      const {kind:legacyKind,definitionId:legacyDefinition,actionId:legacyAction,
        initial:legacyInitial,operation:previousOperation,targetRef:previousTarget,
        config:previousConfig,...extension}=previousOption;
      const config={...(previousConfig??{}),
        ...(legacyInitial!==undefined&&!Object.hasOwn(previousConfig??{},'initial')?{initial:legacyInitial}:{})};
      const option=normalizeRelation({...extension,id:previousOption.id??`option-${targetRef.objectKind}-${targetRef.objectId}`,
        operation:preserveOptionOperations&&(previousOperation==='link'||previousOperation==='unlock'||previousOperation==='grant')?previousOperation:operation,targetRef,config});
      options.push(option);
    }
    // Older editor fixtures and existing form layouts remain readable until
    // migrated. New groups always write the typed relation contract.
    if(!row.querySelector('[name="choiceTargetRef"]')){
      for(const [kind,query,field] of [['definition','choiceDefinitionOption','definitionId'],['action','choiceActionOption','actionId']]){
        for(const input of row.querySelectorAll(`[name="${query}"]:checked`)){
          const objectId=String(input.value??'').trim();if(!objectId)throw new Error(`Acquisition choice ${id} has an empty ${kind}.`);
          const previousOption=oldOptions.get(`${kind}:${objectId}`)??{};
          options.push(previousOption.id?previousOption:{id:`${kind}-${objectId}`,kind,[field]:objectId});
        }
      }
    }
    return {...previous,id,name,min,max,options};
  });
  return {definitionBindings,actionBindings,choiceGroups,initialStateRules:current.initialStateRules??[]};
}
