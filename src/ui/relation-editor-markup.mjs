/** Same row data and HTML attributes as the HBS relation editor partial. */
import {escapeHTML as escape} from './html-utils.mjs';
import {localizedMarkup as t} from './ui-localization.mjs';
const e=escape;
export function renderRelationRow(model,{readOnly=false}={}){
 const operationOptions=model.operationChoices.map(x=>`<option value="${e(x.id)}" data-rta-colors="#666666" ${x.selected?'selected':''}>${t(`Relation${x.id[0].toUpperCase()}${x.id.slice(1)}`,x.id)}</option>`).join('');
 const targetOptions=model.targetChoices.map(x=>`<option value="${e(x.token)}" ${x.selected?'selected':''} data-rta-colors="${e(x.colors??'')}">${e(x.label)}</option>`).join('');
 return `<article class="rta-generic-relation" data-relation-row data-relation-id="${e(model.id)}">
   <div class="rta-generic-relation__fields">
   <div class="form-group rta-form-row"><label>${t('RelationOperation','Operation')}</label><select data-relation-operation ${readOnly?'disabled':''}>${operationOptions}</select></div>
   <div class="form-group rta-form-row"><label>${t('RelationTarget','Target')}</label><select data-relation-target ${readOnly?'disabled':''}>${targetOptions}</select></div>
   </div><details class="rta-config-entry__technical"><summary>${t('RelationParameters','Advanced parameters (JSON)')}</summary><textarea rows="3" data-relation-config ${readOnly?'readonly':''}>${e(model.configJson??'{}')}</textarea></details>${readOnly?'':`<button type="button" data-action="removeRelation" class="rta-config-action" title="${t('RemoveRelation','Remove relation')}"><i class="fa-solid fa-trash"></i></button>`}
  </article>`;
}
