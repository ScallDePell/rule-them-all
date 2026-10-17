import {renderConfirmContent,renderPromptContent,renderTagChoiceContent} from "../ui/dialog-markup.mjs";
/** Foundry-native modal interactions; never use browser dialogs. */
const translate=(key,data={})=>game.i18n?.format?.(key,data)??key;
function dialogClass(){const Dialog=globalThis.foundry?.applications?.api?.DialogV2;if(!Dialog)throw new Error("Foundry DialogV2 is unavailable");return Dialog;}
export async function confirmRTA(key,data={}) {return Boolean(await dialogClass().confirm({window:{title:translate("RTA.UI.ConfirmTitle")},content:renderConfirmContent(translate(key,data)),modal:true,rejectClose:false}));}
export async function promptRTA(key,initial="") {const Dialog=dialogClass();const value=await Dialog.prompt({window:{title:translate(key)},content:renderPromptContent(translate(key),initial),ok:{callback:(event,button)=>button.form?.elements?.value?.value??""},modal:true,rejectClose:false});return value??null;}
/** The tags of an entry, chosen in a dialog: {ids, newTag} (the tags checked, the name typed for a new one), or null. */
export async function chooseTagsRTA(name,tags,selected) {
  const Dialog=dialogClass();
  const content=renderTagChoiceContent(tags,selected,{tags:translate("RTA.UI.TagsOf",{name}),none:translate("RTA.UI.NoTagsYet"),add:translate("RTA.UI.NewTag")});
  const value=await Dialog.prompt({window:{title:translate("RTA.UI.EditTags")},classes:["rta-tag-dialog"],position:{width:640},content,ok:{label:translate("RTA.Template.Apply"),callback:(event,button)=>({ids:[...(button.form?.querySelectorAll('[name="tags"]:checked')??[])].map(box=>box.value),newTag:String(button.form?.elements?.newTag?.value??"").trim()})},modal:true,rejectClose:false});
  return value??null;
}
