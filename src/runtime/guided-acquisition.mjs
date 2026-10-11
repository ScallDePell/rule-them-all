/** A Foundry-native acquisition choice prompt. The same Ruleset IDs and
 * RTA Select source inputs used by configurator editors are retained here.
 * This adapter collects answers; it never grants or invents game effects.
 */
import {relationCatalog} from '../configurator/generic-relations.mjs';
import {resolveAcquisitionChoices} from './acquisition-choices.mjs';
import {RTASelect} from '../ui/rta-select.mjs';
import {createSelectColorResolver,selectColorsAttribute,referenceKindTitle} from '../ui/select-option-presentation.mjs';

const message=(key,fallback,data={})=>{
  const i18n=globalThis.game?.i18n;
  const translation=i18n?.format?.(`RTA.Acquisition.${key}`,data)??i18n?.localize?.(`RTA.Acquisition.${key}`);
  return translation&&translation!==`RTA.Acquisition.${key}`?translation:fallback;
};

export function acquisitionChoiceCatalog(ruleset,template){
  const catalog=new Map(relationCatalog(ruleset).map(x=>[`${x.objectKind}\u0000${x.objectId}`,x]));
  const french=String(globalThis.game?.i18n?.lang??'en').toLowerCase().startsWith('fr');
  return (template.choiceGroups??[]).map(group=>({
    id:group.id,name:group.name,min:group.min,max:group.max,
    options:(group.options??[]).map(option=>{
      const ref=option.targetRef??null,target=ref?catalog.get(`${ref.objectKind}\u0000${ref.objectId}`):null;
      return {id:option.id,targetRef:ref,entry:target?.entry??null,objectKind:ref?.objectKind??'',
        label:target?`${referenceKindTitle(target.objectKind,french)} · ${target.label}`:`${referenceKindTitle(ref?.objectKind??'?',french)} · ${ref?.objectId??'?'}`,
        unavailable:!target||target.entry?.enabled===false};
    })
  }));
}

export async function promptAcquisitionChoices(ruleset,template){
  const Dialog=globalThis.foundry?.applications?.api?.DialogV2;
  if(!Dialog?.wait||typeof document==='undefined')throw new Error('Foundry DialogV2 is unavailable for guided acquisition.');
  const groups=acquisitionChoiceCatalog(ruleset,template),root=document.createElement('div');
  root.className='rta-config-entry rta-guided-acquisition';
  const colorFor=createSelectColorResolver({definitionTypes:ruleset.definitionTypes??[],contentTypes:ruleset.contentTypes??[],familyColors:ruleset.familyColors??{},ruleset});
  for(const [index,group] of groups.entries()){
    const row=document.createElement('div');row.className='form-group rta-form-row';
    const label=document.createElement('label');label.textContent=group.name;
    const field=document.createElement('div');field.className='rta-form-row__control';
    const select=document.createElement('select');select.multiple=true;select.name=`rta-acquisition-group-${index}`;
    select.setAttribute('aria-label',group.name);
    for(const option of group.options){
      const element=document.createElement('option');element.value=option.id;element.textContent=option.label;
      element.disabled=option.unavailable;
      element.dataset.rtaColors=selectColorsAttribute(colorFor(option.objectKind,option.entry));
      select.append(element);
    }
    const hint=document.createElement('small');
    hint.textContent=message('Cardinality',`Select ${group.min} to ${group.max}`,{min:group.min,max:group.max});
    field.append(select,hint);row.append(label,field);root.append(row);
  }
  // Enhance the original native inputs before Foundry mounts the supplied div.
  // Native selects still own FormData and are never replaced as data sources.
  RTASelect.enhance(root);
  const result=await Dialog.wait({window:{title:message('Title','Content acquisition')},modal:true,rejectClose:false,content:root,
    buttons:[
      {action:'confirm',label:message('Confirm','Acquire'),default:true,callback:(_event,button)=>{
        const selections={};const form=button.form;
        for(const [index,group] of groups.entries()){
          const source=form?.elements?.namedItem?.(`rta-acquisition-group-${index}`);
          selections[group.id]=source?[...source.selectedOptions].map(option=>option.value):[];
        }
        resolveAcquisitionChoices(template,selections);
        return selections;
      }},
      {action:'cancel',label:message('Cancel','Cancel')}
    ]
  });
  return result==null||result==='cancel'?null:result;
}
