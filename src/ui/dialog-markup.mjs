import {escapeHTML as escape} from "./html-utils.mjs";
/** HTML for native Foundry dialog bodies; caller controls localization and state. */
export const renderConfirmContent=text=>`<p>${escape(text)}</p>`;
export const renderPromptContent=(label,initial="")=>`<label>${escape(label)}<input type="text" name="value" value="${escape(initial)}" required></label>`;
/** The tags of an entry: the Ruleset's tags to check, and a new tag's name. tags: [{id, label}]; selected: ids. */
export const renderTagChoiceContent=(tags,selected,labels)=>`<fieldset><legend>${escape(labels.tags)}</legend>${tags.length?`<div class="rta-tag-choice">${tags.map(tag=>`<label class="checkbox"><input type="checkbox" name="tags" value="${escape(tag.id)}"${selected.includes(tag.id)?" checked":""}> ${escape(tag.label)}</label>`).join("")}</div>`:`<p>${escape(labels.none)}</p>`}</fieldset><div class="form-group"><label>${escape(labels.add)}</label><input type="text" name="newTag" autocomplete="off"></div>`;
