import {escapeHTML as escape} from "./html-utils.mjs";
/** HTML for native Foundry dialog bodies; caller controls localization and state. */
export const renderConfirmContent=text=>`<p>${escape(text)}</p>`;
export const renderPromptContent=(label,initial="")=>`<label>${escape(label)}<input type="text" name="value" value="${escape(initial)}" required></label>`;
/** The tags of an entry: the Ruleset's tags to check, and a new tag's name. tags: [{id, label}]; selected: ids. */
export const renderTagChoiceContent=(tags,selected,labels)=>`<fieldset><legend>${escape(labels.tags)}</legend>${tags.length?`<div class="rta-tag-choice">${tags.map(tag=>`<label class="checkbox"><input type="checkbox" name="tags" value="${escape(tag.id)}"${selected.includes(tag.id)?" checked":""}> ${escape(tag.label)}</label>`).join("")}</div>`:`<p>${escape(labels.none)}</p>`}</fieldset><div class="form-group"><label>${escape(labels.add)}</label><input type="text" name="newTag" autocomplete="off"></div>`;
/** The inputs an Action asks for before it runs: a list, a checkbox or a field each. t: the Ruleset translator. */
export const renderActionInputsContent=(inputs,t)=>inputs.map(input=>{
  const label=escape(t(input.labelKey)),name=`input-${escape(input.id)}`,current=input.defaultValue??"";
  if(input.options?.length)return `<div class="form-group"><label>${label}</label><select name="${name}">${input.options.map(o=>`<option value="${escape(o.value)}" ${String(o.value)===String(current)?"selected":""}>${escape(t(o.labelKey??String(o.value)))}</option>`).join("")}</select></div>`;
  if(input.valueType==="boolean")return `<div class="form-group"><label>${label}</label><input type="checkbox" name="${name}" ${current?"checked":""}></div>`;
  return `<div class="form-group"><label>${label}</label><input type="${["number","integer"].includes(input.valueType)?"number":"text"}" name="${name}" value="${escape(current)}"></div>`;
}).join("");
/** The Actions offered after a result, to check. options: [{value, label}]. */
export const renderActionChoiceContent=options=>`<div class="rta-sheet-choice">${options.map(o=>`<label class="checkbox"><input type="checkbox" name="choice" value="${escape(o.value)}"> ${escape(o.label)}</label>`).join("")}</div>`;
