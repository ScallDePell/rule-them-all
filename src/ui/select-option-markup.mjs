import {escapeHTML as escape} from "./html-utils.mjs";
/** Shared, HTML-safe native option renderer. This only formats presentational
 * markup: identifiers and user-facing labels always come from the caller.
 */
export function renderSelectOptions(items,{valueKey="id",labelKey="label",colorize=false,selectedValue=null}={}){
  return items.map(item=>{
    const value=String(item?.[valueKey]??""),label=String(item?.[labelKey]??value);
    const color=colorize?` data-rta-colors="${escape(item.colors??"")}"`:"";
    const selected=selectedValue!==null&&value===String(selectedValue)?" selected":"";
    return `<option value="${escape(value)}"${color}${selected}>${escape(label)}</option>`;
  }).join("");
}
export function renderCreationKindsOptions(kinds,selectedValue){
  return renderSelectOptions(kinds.map(value=>({id:value,label:value})),{selectedValue});
}
