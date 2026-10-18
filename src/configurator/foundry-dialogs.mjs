import {renderConfirmContent,renderPartExportContent,renderPartImportContent,renderPromptContent,renderTagChoiceContent} from "../ui/dialog-markup.mjs";
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
/** The element a DialogV2 render callback hands over, whichever form Foundry passes it in. */
const dialogElement=(event,dialog)=>dialog?.element??event?.target?.element??(dialog instanceof HTMLElement?dialog:null);
/** Exporting part of a Ruleset: {name, include} (the part's name, the dependencies kept checked), or null.
    A family's box checks or unchecks all its entries, and shows when only some are. */
export async function exportPartRTA(name,summary,groups,extension) {
  const Dialog=dialogClass();
  const content=renderPartExportContent(name,summary,groups,{name:translate("RTA.Part.Name"),dependencies:translate("RTA.Part.Dependencies"),hint:translate("RTA.Part.DependenciesHint"),none:translate("RTA.Part.NoDependencies"),
    extension:translate("RTA.Extension.Section"),extensionHint:translate("RTA.Extension.SectionHint"),asExtension:translate("RTA.Extension.AsExtension"),version:translate("RTA.Extension.Version"),minVersion:translate("RTA.Extension.MinVersion")},extension);
  const render=(event,dialog)=>{const root=dialogElement(event,dialog);
    for(const box of root?.querySelectorAll?.("[data-part-group]")??[]){
      const members=[...root.querySelectorAll(`[data-part-member="${box.dataset.partGroup}"]`)];
      box.addEventListener("change",()=>{for(const member of members)member.checked=box.checked;});
      // Some of a family checked: its box shows it.
      for(const member of members)member.addEventListener("change",()=>{const checked=members.filter(m=>m.checked).length;box.checked=checked===members.length;box.indeterminate=checked>0&&checked<members.length;});
    }};
  const value=await Dialog.prompt({window:{title:translate("RTA.Part.ExportTitle")},classes:["rta-part-dialog"],position:{width:640},content,render,
    ok:{label:translate("RTA.Part.Export"),icon:"fa-solid fa-file-export",callback:(event,button)=>{const form=button.form,value=name=>String(form?.elements?.[name]?.value??"").trim();
      return {name:value("partName"),include:[...(form?.querySelectorAll('[name="include"]:checked')??[])].map(box=>box.value),
        extension:form?.elements?.asExtension?.checked?{version:value("extensionVersion")||"1.0.0",minVersion:value("extensionMinVersion")}:null};}},modal:true,rejectClose:false});
  return value??null;
}
/** Importing a part: the choice made for each entry in conflict ({key: keep|replace|rename}), or null. */
export async function importPartRTA(summary,conflicts,added,{removed=[],title="RTA.Part.ImportTitle",apply="RTA.Part.ImportApply"}={}) {
  const Dialog=dialogClass();
  const choices=["keep","replace","rename"].map(value=>({value,label:translate(`RTA.Part.Choice.${value}`)}));
  const content=renderPartImportContent(summary,conflicts,added,choices,{conflicts:translate("RTA.Part.Conflicts"),hint:translate("RTA.Part.ConflictsHint"),added:translate("RTA.Part.Added"),removed:translate("RTA.Extension.Removed")},removed);
  const value=await Dialog.prompt({window:{title:translate(title)},classes:["rta-part-dialog"],position:{width:640},content,
    ok:{label:translate(apply),icon:"fa-solid fa-file-import",callback:(event,button)=>Object.fromEntries([...(button.form?.querySelectorAll('[name="decision"]')??[])].map(select=>[select.dataset.key,select.value]))},modal:true,rejectClose:false});
  return value??null;
}
