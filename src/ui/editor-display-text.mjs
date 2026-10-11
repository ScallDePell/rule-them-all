/** Pure UI text formatting: domain IDs and stored reference values never depend on locale. */
const strings={
  NoneSelected:'None selected',
  Selected:'selected',
  MissingTarget:'missing target',
  CreateEntry:'Create {name}',
  EditEntry:'Edit {name}'
};
function message(key,params={}){
  const token=`RTA.EditorDisplay.${key}`;
  const result=globalThis.game?.i18n?.localize?.(token);
  const translated=typeof result==='string'&&result!==token?result:strings[key];
  return translated.replace(/\{(\w+)\}/g,(_match,name)=>String(params[name]??''));
}
export function pickerSummary(items,flag='selected'){
  const labels=items.filter(item=>item?.[flag]).map(item=>item.label);
  if(!labels.length)return message('NoneSelected');
  if(labels.length<=3)return labels.join(', ');
  return `${labels.length} ${message('Selected')} · ${labels.slice(0,2).join(', ')}…`;
}
export function missingTargetLabel(kind,id){return `${kind??'Reference'} / ${id??'?'} · ${message('MissingTarget')}`;}
export function editorDisplayTitle(creating,name){return message(creating?'CreateEntry':'EditEntry',{name});}
