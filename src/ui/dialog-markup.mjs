import {escapeHTML as escape} from "./html-utils.mjs";
/** HTML for native Foundry dialog bodies; caller controls localization and state. */
export const renderConfirmContent=text=>`<p>${escape(text)}</p>`;
export const renderPromptContent=(label,initial="")=>`<label>${escape(label)}<input type="text" name="value" value="${escape(initial)}" required></label>`;
