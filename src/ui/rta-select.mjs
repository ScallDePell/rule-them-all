import {normalizedSelectColors} from "./select-option-presentation.mjs";
import {selectUiText,selectionPlaceholder} from "./select-text.mjs";
/**
 * Rule Them'All — universal selection control.
 * A single visual contract for native <select>, checkbox pickers, independent
 * checkbox collections and the data-bearing Definition grants.
 *
 * All original form inputs stay in the document and keep their names, values,
 * disabled states, and bubbling input/change events. This module owns only the
 * view and the interaction lifecycle, never the ruleset or business data.
 */
const selectionText=selectionPlaceholder;
const aria=(node,name,text)=>{node.setAttribute(name,text);return node;};
const build=(tag,classes)=>{const node=document.createElement(tag);if(classes)node.className=classes;return node;};
// One form-row implementation, independent of the selector's data adapter.
// The outer row, not RTA Select, owns the label column and flow spacing.
const formRow=(control,label)=>{
  const row=build("div","rta-form-row rta-form-row--picker");
  const title=build("span","rta-form-row__label");title.textContent=label;
  const field=build("div","rta-form-row__control");field.append(control);
  row.append(title,field);
  return row;
};
const alreadyInFormRow=node=>Boolean(node.closest('.form-group, .rta-form-row'));
const isToolbarControl=node=>Boolean(node.closest('.rta-sheet-component__toolbar, .rta-config-actions, .rta-configurator__toolbar, .rta-lab-tool-tabs'));

/** One optional color rail placed BEFORE the checkbox, never part of the saved value. */
const decorateOption=(label,rawColors)=>{
  const colors=normalizedSelectColors(rawColors);
  label.querySelector(":scope > .rta-select__accents")?.remove();
  if(!colors.length)return;
  const rail=build("span","rta-select__accents");rail.setAttribute("aria-hidden","true");
  for(const color of colors){const line=build("span","rta-select__accent");line.style.backgroundColor=color;rail.append(line);}
  label.insertBefore(rail,label.querySelector(':scope > input[type="checkbox"]'));
};
const safeLabel=element=>String(element.dataset.pickerLabel??element.textContent??"").trim();
const emit=input=>{
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
};

export class RTASelect {
  static #instances=new WeakMap();
  static #active=null;
  static #bound=false;
  static #observers=new WeakMap();

  /** Install the same selector into every supported form control in a window. */
  static enhance(root,{observe=false}={}){
    if(!root?.querySelectorAll)return 0;
    let count=0;
    const scan=(selector,adapter)=>{
      for(const node of root.querySelectorAll(selector)){
        if(node.closest(".rta-select")||RTASelect.#instances.has(node))continue;
        const inst=adapter(node);
        if(inst){RTASelect.#instances.set(node,inst);count++;}
      }
    };
    // Specific adapters first, so no original control is doubly enhanced.
    scan(".rta-binding-list:has([data-definition-binding])",node=>RTASelect.#fromBindings(node));
    scan("[data-picker]",node=>RTASelect.#fromPicker(node));
    scan(".rta-config-entry__check-group:has(input[type=checkbox])",node=>RTASelect.#fromCheckGroup(node));
    scan('select:not([data-rta-select-source])',node=>RTASelect.#fromNative(node));
    scan('.rta-lab-tool-tabs:has(input[type=radio])',node=>RTASelect.#fromRadios(node));
    if(observe&&!RTASelect.#observers.has(root)&&typeof MutationObserver!=="undefined"){
      let queued=false;
      const observer=new MutationObserver(records=>{
        if(!records.some(r=>r.addedNodes.length))return;
        if(queued)return;
        queued=true;
        queueMicrotask(()=>{queued=false;RTASelect.enhance(root);});
      });
      observer.observe(root,{childList:true,subtree:true});
      RTASelect.#observers.set(root,observer);
    }
    RTAFormRows.enhance(root);
    RTASelect.#installGlobalEvents();
    return count;
  }
  static stop(root){RTASelect.#observers.get(root)?.disconnect();RTASelect.#observers.delete(root);}
  static #installGlobalEvents(){
    if(RTASelect.#bound||typeof document==="undefined")return;
    RTASelect.#bound=true;
    document.addEventListener("pointerdown",event=>{
      const active=RTASelect.#active;
      if(active&&!active.host.contains(event.target))active.close();
    },true);
    document.addEventListener("keydown",event=>{
      const active=RTASelect.#active;
      if(!active)return;
      if(event.key==="Escape"){event.preventDefault();active.close({focus:true});}
    },true);
    globalThis.addEventListener?.("resize",()=>RTASelect.#active?.position());
    globalThis.addEventListener?.("scroll",()=>RTASelect.#active?.position(),true);
  }
  static #nativeLabel(node){
    const attached=node.closest("label")?.childNodes?.[0]?.textContent?.trim() ||
      node.closest(".form-group")?.querySelector(":scope > label")?.textContent?.trim() ||
      node.closest("[data-definition-field]")?.querySelector(":scope > label")?.textContent?.trim();
    const associated=node.id?document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim():"";
    const fr=String(globalThis.game?.i18n?.lang??document.documentElement?.lang??"en").startsWith("fr");
    const operand=node.closest("[data-rule-operand-editor]")?.dataset.ruleOperandEditor;
    const sheet=node.dataset.sheetProp;
    const identity=node.hasAttribute("data-rule-operand-kind")?(selectUiText("OperandType"))
      :operand?({parameter:selectUiText("Parameter"),formula:selectUiText("Formula"),reference:selectUiText("Reference")}[operand]??operand)
      :sheet==="kind"?(selectUiText("ComponentType"))
      :sheet==="source"?(selectUiText("ComponentSource"))
      :node.dataset.stepProp||node.dataset.fieldProp||sheet||node.name||"";
    const fallback=String(identity).replace(/([a-z])([A-Z])/g,"$1 $2");
    return String(node.getAttribute("aria-label")||attached||associated||fallback||(selectUiText("GenericSelection"))).replace(/[:：]\s*$/,"").trim();
  }
  static #hasNativeLabel(node){
    return Boolean(node.closest("label") || node.closest(".form-group")?.querySelector(":scope > label") ||
      node.closest("[data-definition-field]")?.querySelector(":scope > label") ||
      (node.id&&document.querySelector(`label[for="${CSS.escape(node.id)}"]`)));
  }
  static #attachLabel(root,text){
    const label=build("span","rta-select__label");
    label.textContent=text;
    root.prepend(label);
  }
  static #fromNative(native){
    if(native.dataset.rtaSelectSource!==undefined)return null;
    const root=build("div","rta-select");
    const multiple=native.multiple;
    root.dataset.rtaSelectLabel=RTASelect.#nativeLabel(native);
    const hasLabel=RTASelect.#hasNativeLabel(native);
    // Formula and Condition operands already live in a compact three-column
    // grid (kind | value | remove). Injecting a standard form row INSIDE that
    // grid creates a nested 160-200px label column in a 7-9rem cell and
    // collapses the dropdown to its chevron. The existing trigger aria-label
    // keeps these inline selectors accessible without a visible extra label.
    const compactOperand=Boolean(native.closest('.rta-rule-operand'));
    const addFormRow=!compactOperand&&!hasLabel&&!alreadyInFormRow(native)&&
      Boolean(native.closest('.rta-config-entry'))&&!isToolbarControl(native);
    if(!compactOperand&&!hasLabel&&!addFormRow)RTASelect.#attachLabel(root,root.dataset.rtaSelectLabel);
    root.dataset.rtaSelectMode=multiple?"multiple":"single";
    root.dataset.rtaSelectKind="native";
    if(addFormRow)native.parentNode.insertBefore(formRow(root,root.dataset.rtaSelectLabel),native);
    else native.parentNode.insertBefore(root,native);
    root.append(native);
    native.dataset.rtaSelectSource="";
    native.classList.add("rta-select__native");
    native.tabIndex=-1;
    const instance=new RTASelect(root,{multiple});
    instance.native=native;
    instance.#renderNative();
    native.addEventListener("change",()=>instance.refresh());
    native.addEventListener("invalid",event=>{
      event.preventDefault();
      instance.trigger.focus();
      instance.open();
    });
    return instance;
  }
  static #fromPicker(old){
    const root=build("div","rta-select");
    for(const {name,value} of [...old.attributes])if(name.startsWith("data-")&&name!=="data-picker-filter")root.setAttribute(name,value);
    root.dataset.rtaSelectMode=old.hasAttribute("data-picker-single")?"single":"multiple";
    root.dataset.rtaSelectKind="picker";
    const heading=old.querySelector(":scope > summary > strong")?.textContent?.trim()
      ??old.querySelector(":scope > summary")?.textContent?.trim()??"";
    root.dataset.rtaSelectLabel=heading;
    const nestedInRow=alreadyInFormRow(old);
    // Pickers have NO vertical label of their own. A single canonical grid
    // places the label left and the actual RTA Select field right.
    const body=old.querySelector(":scope > .rta-picker__body, :scope > .rta-choice-list")??old.querySelector(".rta-choice-list");
    if(!body)return null;
    const replacement=nestedInRow?root:formRow(root,heading||selectUiText("GenericSelection"));
    if(old.id)replacement.id=old.id;
    old.replaceWith(replacement);
    const inst=new RTASelect(root,{multiple:root.dataset.rtaSelectMode!=="single",body});
    inst.#collectExisting(body);
    return inst;
  }
  static #fromCheckGroup(old){
    const root=build("div","rta-select");
    root.dataset.rtaSelectKind="checkboxes";
    root.dataset.rtaSelectMode="multiple";
    root.dataset.rtaSelectLabel=old.dataset.rtaSelectLabel||old.closest("details")?.querySelector(":scope > summary")?.textContent?.trim()||"options";
    const replacement=alreadyInFormRow(old)?root:formRow(root,root.dataset.rtaSelectLabel);
    if(old.id)replacement.id=old.id;
    old.replaceWith(replacement);
    const inst=new RTASelect(root,{multiple:true,body:old});
    inst.#collectExisting(old);
    return inst;
  }
  static #fromBindings(list){
    if(list.dataset.rtaSelectBound!==undefined)return null;
    const entries=[...list.querySelectorAll(":scope > [data-definition-binding]")];
    if(!entries.length)return null;
    list.dataset.rtaSelectBound="";
    const root=build("div","rta-select");
    root.dataset.rtaSelectKind="bindings";
    root.dataset.rtaSelectMode="multiple";
    root.dataset.rtaSelectLabel=selectUiText("Definitions");
    list.parentNode.insertBefore(formRow(root,"Definitions granted"),list);
    const body=build("div","rta-select__options");
    const inst=new RTASelect(root,{multiple:true,body});
    for(const row of entries){
      const original=row.querySelector(':scope > .rta-binding-card__title input[name="templateDefinitionRefs"]');
      if(!original)continue;
      const title=row.querySelector(":scope > .rta-binding-card__title");
      const label=title?.querySelector("strong")?.textContent?.trim()||original.value;
      const option=build("label","rta-select__option");
      option.dataset.rtaColors=row.dataset.rtaColors??"";
      const clone=build("input");clone.type="checkbox";clone.value=original.value;clone.checked=original.checked;clone.disabled=original.disabled;
      option.append(clone,document.createTextNode(label));body.append(option);
      // Original values remain on the binding card for existing #collect logic.
      // Only the selectable checkbox moves into the unified control.
      original.classList.add("rta-select__binding-source");
      title?.classList.add("rta-select__binding-title");
      row.hidden=!original.checked;
      clone.addEventListener("change",()=>{
        original.checked=clone.checked;row.hidden=!clone.checked;emit(original);
        inst.refresh();
      });
      original.addEventListener("change",()=>{clone.checked=original.checked;row.hidden=!original.checked;inst.refresh();});
    }
    inst.#collectExisting(body);
    return inst;
  }
  static #fromRadios(container){
    if(container.dataset.rtaSelectRadio!==undefined)return null;
    const controls=[...container.querySelectorAll('input[type="radio"]')];
    if(!controls.length)return null;
    container.dataset.rtaSelectRadio="";
    const root=build("div","rta-select");root.dataset.rtaSelectKind="radios";root.dataset.rtaSelectMode="single";root.dataset.rtaSelectLabel=selectUiText("Mode");
    container.parentNode.insertBefore(root,container);
    const body=build("div","rta-select__options");
    const inst=new RTASelect(root,{multiple:false,body});
    for(const source of controls){
      const option=build("label","rta-select__option");const input=build("input");input.type="checkbox";input.value=source.value;input.checked=source.checked;input.disabled=source.disabled;
      option.append(input,document.createTextNode(source.closest("label")?.textContent?.trim()??source.value));body.append(option);
      input.addEventListener("change",()=>{
        if(input.checked){source.checked=true;emit(source);}else{source.checked=false;emit(source);}
        for(const other of body.querySelectorAll('input[type="checkbox"]'))if(other!==input)other.checked=false;
        inst.refresh();
      });
    }
    container.classList.add("rta-select__radio-sources");
    inst.#collectExisting(body);
    return inst;
  }

  constructor(host,{multiple=false,body=null}={}){
    this.host=host;this.multiple=multiple;
    this.trigger=aria(build("button","rta-select__trigger"),"aria-haspopup","dialog");
    this.trigger.type="button";this.trigger.setAttribute("aria-expanded","false");
    this.trigger.setAttribute("aria-label",host.dataset.rtaSelectLabel||selectUiText("GenericSelection"));
    const text=build("span","rta-select__value");
    const arrow=build("span","rta-select__chevron");arrow.setAttribute("aria-hidden","true");arrow.textContent="▾";
    this.value=text;this.trigger.append(text,arrow);
    this.panel=build("div","rta-select__panel");
    this.panel.hidden=true;
    this.panel.setAttribute("role","dialog");
    this.panel.setAttribute("aria-label",host.dataset.rtaSelectLabel||selectUiText("GenericSelection"));
    this.search=build("input","rta-select__search");this.search.type="search";this.search.placeholder=selectUiText("Search");
    this.search.setAttribute("aria-label",this.search.placeholder);
    this.options=body??build("div","rta-select__options");
    this.options.classList.add("rta-select__options");
    this.panel.append(this.search,this.options);
    this.host.prepend(this.trigger,this.panel);
    // A field title must remain visible above the control, including after
    // construction prepends the trigger and floating panel.
    const title=this.host.querySelector(":scope > .rta-select__label");
    if(title)this.host.prepend(title);
    this.opened=false;
    this.history=[];
    this.trigger.addEventListener("click",()=>this.opened?this.close():this.open());
    this.search.addEventListener("input",()=>this.#filter());
    this.search.addEventListener("keydown",event=>{
      if(event.key==="ArrowDown"){
        const first=this.#items().find(input=>!input.disabled&&!input.closest("label")?.hidden);
        if(first){event.preventDefault();first.focus();}
      }
    });
    this.options.addEventListener("keydown",event=>{
      if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
      const selectable=this.#items().filter(input=>!input.disabled&&!input.closest("label")?.hidden);
      if(!selectable.length)return;
      const index=selectable.indexOf(document.activeElement);
      let next=0;
      if(event.key==="End")next=selectable.length-1;
      if(event.key==="ArrowDown")next=Math.min(selectable.length-1,index+1);
      if(event.key==="ArrowUp")next=Math.max(0,index-1);
      event.preventDefault();selectable[next].focus();
    });
    this.options.addEventListener("change",event=>{
      if(!event.target.matches?.('input[type="checkbox"]'))return;
      const value=event.target.value;
      if(event.target.checked&&!this.history.includes(value))this.history.push(value);
      if(!event.target.checked)this.history=this.history.filter(x=>x!==value);
      if(this.native){this.#fromInput(event.target);return;}
      if(!this.multiple&&event.target.checked){
        for(const other of this.#items())if(other!==event.target)other.checked=false;
      }
      // Keep DOM order stable until the next open.
      this.refresh();
      if(!this.multiple&&event.target.checked)this.close();
    });
    this.refresh();
    // Existing saved choices have an order too: seed it before later clicks.
    this.history=this.#selected().map(input=>input.value);
  }
  #items(){return [...this.options.querySelectorAll('input[type="checkbox"]')].filter(input=>!!input.closest("label"));}
  #itemLabel(input){return safeLabel(input.closest("label"));}
  #collectExisting(body){
    const search=body.querySelector('[data-picker-filter],input[type="search"]');
    if(search){search.remove();this.search.placeholder=search.placeholder||this.search.placeholder;}
    for(const option of body.querySelectorAll("label")){
      if(option.querySelector(':scope > input[type="checkbox"]')){
        option.classList.add("rta-select__option");
        const input=option.querySelector(':scope > input[type="checkbox"]');
        // Remove per-row frame from the old visual contract, not the checkbox state.
        if(!option.hasAttribute("data-picker-option"))option.setAttribute("data-picker-option","");
        if(!option.hasAttribute("data-picker-label"))option.dataset.pickerLabel=this.#itemLabel(input);
        decorateOption(option,option.dataset.rtaColors);
      }
    }
    this.refresh();
  }
  #renderNative(){
    const native=this.native;if(!native)return;
    this.options.replaceChildren();
    // A single-select's empty native <option> represents the absence of a
    // selection, not a checkbox choice. Preserve it in the native control so
    // clearing a selection still serializes the empty value as before.
    for(const [index,option] of [...native.options].entries()){
      if(!this.multiple&&option.value==="")continue;
      const line=build("label","rta-select__option");
      line.dataset.pickerOption="";line.dataset.pickerLabel=option.label;
      decorateOption(line,option.dataset.rtaColors);
      const input=build("input");input.type="checkbox";input.value=option.value;
      input.dataset.rtaNativeIndex=String(index);
      input.checked=option.selected;input.disabled=option.disabled||native.disabled;
      line.append(input,document.createTextNode(option.label));
      this.options.append(line);
    }
    this.refresh();
    if(!this.history.length)this.history=this.#selected().map(input=>input.value);
  }
  #fromInput(input){
    const native=this.native;
    if(!native||native.disabled)return;
    if(this.multiple){
      for(const option of native.options)if(option.value===input.value)option.selected=input.checked;
    }else{
      if(input.checked)native.selectedIndex=Number(input.dataset.rtaNativeIndex);
      else {
        // If there is an empty sentinel, restore it; otherwise a native
        // select with no selected item correctly has selectedIndex = -1.
        native.selectedIndex=[...native.options].findIndex(option=>option.value==="");
      }
    }
    emit(native);
    this.refresh();
    if(!this.multiple&&input.checked)this.close();
  }
  #selected(){return this.#items().filter(x=>x.checked);}
  refresh(){
    if(this.native){
      const opts=[...this.native.options];const inputs=this.#items();
      inputs.forEach(input=>{
        const option=opts[Number(input.dataset.rtaNativeIndex)];
        input.checked=!!option?.selected;
        input.disabled=!!(option?.disabled||this.native.disabled);
      });
      this.trigger.disabled=!!this.native.disabled;
    }
    const selected=this.#selected();
    const labels=selected.map(x=>this.#itemLabel(x));
    this.value.textContent=labels.length?labels.join(", "):selectionText(this.host,this.multiple);
    this.value.title=labels.join(", ");
    this.value.classList.toggle("rta-select__placeholder",!labels.length);
    const chosen=new Set(selected);
    for(const input of this.#items()){
      if(!this.multiple){
        if(this.native){
          const idx=Number(input.dataset.rtaNativeIndex);
          input.disabled=!!(this.native.disabled||this.native.options[idx]?.disabled||(selected.length&&!chosen.has(input)));
        }else{
          // Intrinsically disabled options stay disabled even after clearing.
          if(input.dataset.rtaDisabledInitial===undefined)input.dataset.rtaDisabledInitial=String(input.disabled);
          input.disabled=input.dataset.rtaDisabledInitial==="true"||!!(selected.length&&!chosen.has(input));
        }
      }
      input.closest("label")?.classList.toggle("is-disabled",input.disabled);
    }
    const summary=this.host.querySelector(":scope > .rta-select__trigger [data-picker-summary]");
    if(summary)summary.textContent=this.value.textContent;
  }
  #filter(){
    const term=this.search.value.trim().toLocaleLowerCase();
    for(const row of this.options.querySelectorAll("label.rta-select__option")){
      row.hidden=!!term&&!safeLabel(row).toLocaleLowerCase().includes(term);
    }
  }
  #reorder(){
    if(this.native)this.#renderNative();
    const rows=[...this.options.children].filter(row=>row.matches?.("label.rta-select__option"));
    const chosen=new Set(this.#selected().map(input=>input.value));
    const priority=new Map(this.history.map((value,i)=>[value,i]));
    const selected=rows.filter(row=>chosen.has(row.querySelector("input")?.value));
    const others=rows.filter(row=>!chosen.has(row.querySelector("input")?.value));
    selected.sort((a,b)=>(priority.get(a.querySelector("input")?.value)??10000)-(priority.get(b.querySelector("input")?.value)??10000));
    for(const row of [...selected,...others])this.options.append(row);
  }
  position(){
    if(!this.opened)return;
    if(this.panel.matches?.(':popover-open')||this.panel.dataset.rtaFallback){
      const r=this.trigger.getBoundingClientRect();
      const viewport=globalThis.visualViewport;
      const w=viewport?.width??globalThis.innerWidth??900;
      const h=viewport?.height??globalThis.innerHeight??800;
      const panelHeight=Math.min(310,Math.max(100,this.panel.scrollHeight));
      const below=h-r.bottom-8;const above=r.top-8;
      const top=below>=Math.min(panelHeight,180)||below>=above?r.bottom+3:Math.max(4,r.top-panelHeight-3);
      Object.assign(this.panel.style,{left:`${Math.max(4,Math.min(r.left,w-190))}px`,top:`${Math.max(4,top)}px`,width:`${Math.min(Math.max(r.width,190),w-8)}px`});
    }
  }
  open(){
    if(this.opened||this.trigger.disabled)return;
    if(RTASelect.#active&&RTASelect.#active!==this)RTASelect.#active.close();
    this.#reorder();this.refresh();this.search.value="";this.#filter();
    this.opened=true;RTASelect.#active=this;this.panel.hidden=false;
    this.trigger.setAttribute("aria-expanded","true");
    if(typeof this.panel.showPopover==="function"){
      this.panel.setAttribute("popover","manual");
      try{this.panel.showPopover();}catch{this.panel.dataset.rtaFallback="";}
    }else{this.panel.dataset.rtaFallback="";}
    this.position();
    this.search.focus({preventScroll:true});
  }
  close({focus=false}={}){
    if(!this.opened)return;
    this.opened=false;if(RTASelect.#active===this)RTASelect.#active=null;
    this.trigger.setAttribute("aria-expanded","false");
    if(typeof this.panel.hidePopover==="function"&&this.panel.matches?.(":popover-open"))this.panel.hidePopover();
    this.panel.hidden=true;
    // Save chronology without moving anything while the dropdown was open.
    const selected=this.#selected().map(input=>input.value);
    this.history=[...this.history.filter(value=>selected.includes(value)),...selected.filter(value=>!this.history.includes(value))];
    if(focus)this.trigger.focus();
  }
}
export const enhanceRTASelects=(root,options)=>RTASelect.enhance(root,options);

/** Standard field rows, including inline markup created later by editors.
 *  Keep implicit <label> semantics: a label with a nested input becomes the
 *  grid itself; controls are never cloned or replaced. */
export class RTAFormRows {
  static enhance(root){
    if(!root?.querySelectorAll)return 0;
    let changed=0;
    const withinEntry=label=>Boolean(label.closest('.rta-config-entry'));
    for(const row of root.querySelectorAll('.rta-config-entry .form-group, .rta-configurator .rta-runtime-lab .form-group')){
      if(!row.querySelector(':scope > label'))continue;
      if(!row.classList.contains('rta-form-row')){row.classList.add('rta-form-row');changed++;}
    }
    const candidates=root.querySelectorAll([
      '.rta-config-entry .rta-field-editor__grid > label',
      '.rta-config-entry .rta-field-editor__numeric > label',
      '.rta-config-entry .rta-field-editor__body > label',
      '.rta-config-entry .rta-config-entry__section > label',
      '.rta-config-entry .rta-sheet-builder > label',
      '.rta-config-entry fieldset > label'
    ].join(','));
    for(const label of candidates){
      if(!withinEntry(label)||label.classList.contains('rta-form-row')||
        label.matches('.rta-field-editor__check, .rta-definition-field__use, .rta-binding-card__title, .rta-select__option, [data-picker-option]'))continue;
      if(!label.querySelector(':scope > input, :scope > select, :scope > textarea, :scope > .rta-select'))continue;
      // Raw/JSON editors and compact repeating card controls are intentionally
      // full-width/inline specialized surfaces, not ordinary form rows.
      if(label.closest('.rta-config-entry__technical, .rta-binding-card__values, .rta-sheet-component__config'))continue;
      label.classList.add('rta-form-row','rta-form-row--nested');changed++;
    }
    return changed;
  }
}
