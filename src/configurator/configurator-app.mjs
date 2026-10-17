import {resolvePresentation} from "./declarative-contracts.mjs";
import {buildFacet, matchesFacet, toggleFacet} from "./card-facets.mjs";
import {availableDocumentTypes,documentTypeLabel} from "../core/system-document-types.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {RULESET_SECTIONS,rulesetColor,sectionColor,collectionColor,objectColor,sectionForCollection,mayOverrideSection} from "./ruleset-colors.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {createSelectColorResolver,selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {buildDependencyExplorer,buildDependencyGraph} from "./dependency-explorer.mjs";
import {confirmRTA, promptRTA} from "./foundry-dialogs.mjs";
import {openContextMenu} from "../ui/context-menu.mjs";
import {entryDeletionView,deleteRulesetEntry} from "./entry-deletion.mjs";
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {ConfiguratorEntryEditor} from "./configurator-entry-editor.mjs";
import {buildRuntimeLabDemoProfile} from "../runtime/runtime-demo-profile.mjs";
import {applyRuntimeChoice,describeRuntimeResult,progressionLabRows} from "./runtime-lab-view.mjs";
import {diagnosticEditor,pathInObject} from "./diagnostic-focus.mjs";
import {recipeCards,recipeTextKeys} from "./recipes.mjs";
import {moduleLanguage} from "../core/module-language.mjs";


const neutral = RTA_NEUTRAL_COLOR;
const label = key => game.i18n?.localize?.(key) ?? key;
const slug = value => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const uid = prefix => `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;


const TOP_LEVEL = Object.freeze([
  {view:"parameters", kind:"parameter", titleKey:"RTA.Nav.Parameters", list:"listParameters", collection:"parameters"},
  {view:"formulas", kind:"formula", titleKey:"RTA.Nav.Formulas", list:"listFormulas", collection:"formulas"},
  {view:"formulaBindings", kind:"formulaBinding", titleKey:"RTA.Nav.FormulaBindings", list:"listFormulaBindings", collection:"formulaBindings"},
  {view:"conditions", kind:"condition", titleKey:"RTA.Nav.Conditions", list:"listConditions", collection:"conditions"},
  {view:"rolls", kind:"roll", titleKey:"RTA.Nav.Rolls", list:"listRolls", collection:"rolls"},
  {view:"outcomes", kind:"outcome", titleKey:"RTA.Nav.Outcomes", list:"listOutcomes", collection:"outcomes"},
  {view:"tests", kind:"test", titleKey:"RTA.Nav.Tests", list:"listTests", collection:"tests"},
  {view:"effects", kind:"effect", titleKey:"RTA.Nav.Effects", list:"listEffects", collection:"effects"},
  {view:"actions", kind:"action", titleKey:"RTA.Nav.Actions", list:"listActions", collection:"actions"},
  {view:"permissions", kind:"permissionPolicy", titleKey:"RTA.Nav.Permissions", list:"listPermissionPolicys", collection:"permissionPolicies"},
  {view:"events", kind:"eventType", titleKey:"RTA.Nav.Events", list:"listEventTypes", collection:"eventTypes"},
  {view:"triggers", kind:"trigger", titleKey:"RTA.Nav.Triggers", list:"listTriggers", collection:"triggers"},
  {view:"modifiers", kind:"modifier", titleKey:"RTA.Nav.Modifiers", list:"listModifiers", collection:"modifiers"},
  {view:"durations", kind:"duration", titleKey:"RTA.Nav.Durations", list:"listDurations", collection:"durations"},
  {view:"dice", kind:"die", titleKey:"RTA.Nav.Dice", list:"listDice", collection:"dice"},
  {view:"tables", kind:"table", titleKey:"RTA.Nav.Tables", list:"listTables", collection:"tables"},
  {view:"scales", kind:"scale", titleKey:"RTA.Nav.Scales", list:"listScales", collection:"scales"},
  {view:"creationSystems", kind:"creationSystem", titleKey:"RTA.Nav.CreationSystems", list:"listCreationSystems", collection:"creationSystems"},
  {view:"progressionSystems", kind:"progressionSystem", titleKey:"RTA.Nav.ProgressionSystems", list:"listProgressionSystems", collection:"progressionSystems"},
  // Sheets stay out of the navigation until their runtime exists (milestone 4).
  {view:"sheetDefinitions", kind:"sheetDefinition", titleKey:"RTA.Nav.SheetDefinitions", list:"listSheetDefinitions", collection:"sheetDefinitions"},
  {view:"contentTypes", kind:"contentType", titleKey:"RTA.Nav.ContentTypes", list:"listContentTypes", collection:"contentTypes"},
  {view:"categories", kind:"category", titleKey:"RTA.Nav.Categories", list:"listCategories", collection:"categories"},
  {view:"tags", kind:"tag", titleKey:"RTA.Nav.Tags", list:"listTags", collection:"tags"}
]);

function localize(api, versionId, key) {
  if (!key) return "";
  try { return api.resolveLocalizedText(versionId, moduleLanguage(), key, value => label(value)); }
  catch { return label(key); }
}

const STATUS_LABELS={draft:"RTA.Template.StatusDraft",ready:"RTA.Template.StatusReady",validated:"RTA.Template.StatusValidated"};
const statusLabel=status=>STATUS_LABELS[status]?game.i18n?.localize?.(STATUS_LABELS[status])??status:status;

export class ConfiguratorApp extends ConfiguratorWindow {
  static registerSettings(settings) {
    settings.register(MODULE_ID, "configuratorSelectedRuleset", {scope:"client", config:false, type:String, default:""});
  }

  static DEFAULT_OPTIONS = {id:"rta-configurator", window:{title:"Rule Them'All Configurator", resizable:true}, position:{width:1118,height:860}};
  static PARTS = {content:{template:`modules/${MODULE_ID}/templates/configurator/configurator.hbs`, scrollable:["[data-main-scroll]"]}};
  static MINIMUM = {width:620,height:380};
  static #open = new Set();
  static refreshOpen() { for (const app of this.#open) Promise.resolve(app.render(false)).catch(()=>{}); }

  #selected = "";
  #displayMode = "tiles";
  #dependencySelected = "";
  #dependencyClick = null;
  #tagFilters = new Map();
  #categoryFilters = new Map();
  #dependencySearch = "";
  #dependencyListScroll = 0;
  #dependencyUnresolvedOnly = false;
  #view = "general";
  #navGroup = "general";
  #error = "";
  #scroll = new Map();
  #restoreScroll = false;
  #runtimeResult = null;
  /** The last Action use the Lab executed (result.use: actionId, transactionId, context, dice, rerollCount): what a reroll Action replays. */
  #runtimeLastUse = null;
  // null: not chosen yet, defaulted on render; "": cleared by the user, kept cleared.
  #runtimeSelection = {source:null,target:null,actionId:null,formulaId:null,conditionId:null,testId:null,eventTypeId:null,rollFormula:"",sourceType:"",targetType:"",actorRole:"source",tool:"test",definitionId:"",contentKey:"",inputs:{},progressionId:null,milestoneInputs:{}};
  /** The selected Action's inputs, as described by the runtime (typed values, allowed options). */
  #runtimeInputSpecs = [];
  entryEditor;

  async #api() { return game.ruleThemAll?.configurator ?? await game.ruleThemAll?.configuratorReady; }

  async _onRender(context, options) {
    await super._onRender(context, options);
    ConfiguratorApp.#open.add(this);
    this.#bind();
    const depList=this.element?.querySelector('.rta-dependencies__items');
    if(depList)depList.scrollTop=this.#dependencyListScroll;
    if(this._rtaOutsideClick)document.removeEventListener("pointerdown",this._rtaOutsideClick);
    if(this._rtaEscape)document.removeEventListener("keydown",this._rtaEscape,true);
    this.#bindNav();
    this.#bindDragDrop();
    if (this.#restoreScroll) {
      const area = this.element?.querySelector("[data-main-scroll]");
      const point = this.#scroll.get(this.#view);
      if (area && point) { area.scrollTop = point.top; area.scrollLeft = point.left; }
      this.#restoreScroll = false;
    }
  }
  _onClose(options) { if(this._rtaOutsideClick)document.removeEventListener("pointerdown",this._rtaOutsideClick); if(this._rtaEscape)document.removeEventListener("keydown",this._rtaEscape,true); ConfiguratorApp.#open.delete(this); super._onClose?.(options); }

  /** What the draft still lacks before Publish, as reported by the Core (CP-10). */
  #publishReadiness(api, ruleset) {
    const {errors} = api.diagnoseRuleset(this.#selected, {scope: "publish"});
    const entryAt = path => { const match = /^([A-Za-z]+)\[(\d+)\]/.exec(path); return match ? ruleset[match[1]]?.[Number(match[2])] : null; };
    const items = errors.slice(0, 50).map(entry => {
      const target = entryAt(entry.path);
      const name = target?.nameKey ? localize(api, this.#selected, target.nameKey) : entry.objectId ?? entry.objectKind;
      const editor = diagnosticEditor(entry, this.#selected);
      return {objectLabel: name, message: entry.message, kind: editor?.kind ?? "", entryId: editor?.id ?? "", path: pathInObject(entry.path)};
    });
    return {ready: errors.length === 0, count: errors.length, items};
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const api = await this.#api();
    if (!this.#selected) this.#selected = game.settings?.get(MODULE_ID,"configuratorSelectedRuleset") ?? "";
    const records = api.listRulesetFamilies().flatMap(family => family.versions);
    if (this.#selected && !records.some(record => record.versionId === this.#selected)) this.#selected = "";
    const record = this.#selected ? api.getRulesetVersion(this.#selected) : null;
    const ruleset = record?.workingDraft;
    const activeId = api.getActiveVersionId();

    const rulesets = records.map(record => ({
      versionId:record.versionId, rulesetId:record.rulesetId, version:record.version, status:record.status,
      name:localize(api,record.versionId,record.workingDraft.nameKey), color:rulesetColor(record.workingDraft), isActive:record.versionId===activeId,
      isValidated:record.status==="validated", isReady:record.status==="ready", isDraft:record.status==="draft",
      statusLabel:statusLabel(record.status), canActivate:Boolean(record.publishedSnapshot), canCreateVersion:record.status==="validated"
    }));

    const definitionTypes = ruleset ? api.listDefinitionTypes(this.#selected).map(type => ({
      ...type, name:localize(api,this.#selected,type.nameKey), color:objectColor(ruleset,"definitionTypes",type),
      active:this.#view===`definitions:${type.id}`
    })).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name)) : [];
    const contentTypes = ruleset ? api.listContentTypes(this.#selected).map(type=>({
      ...type,name:localize(api,this.#selected,type.nameKey),color:objectColor(ruleset,"contentTypes",type),
      active:this.#view===`content:${type.id}`
    })).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name)) : [];

    // A single navigation/collection hierarchy drives both layout and color inheritance.
    // The Ruleset owns all accent values; this descriptor contains no palette.
    const navigation = ruleset ? RULESET_SECTIONS.map(section=>{
      let items=[];
      if(section.id==='general')items=[{view:'general',title:label(section.titleKey),active:this.#view==='general'}];
      else if(section.id==='definitions')items=[
        {view:'definitionTypes',title:label('RTA.Nav.DefinitionTypes'),active:this.#view==='definitionTypes'},
        ...definitionTypes.map(type=>({view:`definitions:${type.id}`,title:type.name,active:type.active,color:type.color}))
      ];
      else if(section.id==='content')items=[
        {view:'contentTypes',title:label('RTA.Nav.ContentTypes'),active:this.#view==='contentTypes'},
        ...contentTypes.map(type=>({view:`content:${type.id}`,title:type.name,active:type.active,color:type.color}))
      ];
      else if(section.id==='tools')items=[{view:'runtimeLab',title:label('RTA.Nav.RuntimeLab'),active:this.#view==='runtimeLab'},{view:'dependencies',title:label('RTA.Nav.Dependencies'),active:this.#view==='dependencies'}];
      else {
        items=TOP_LEVEL.filter(item=>section.collections.includes(item.collection)&&!item.hidden&&!['contentTypes'].includes(item.collection))
          .map(item=>({...item,title:label(item.titleKey),active:this.#view===item.view}));
      }
      return {group:section.id,titleKey:section.titleKey,items};
    }) : [];

    const navGroups = navigation.map(entry => {
      const id = entry.view ?? entry.group.toLowerCase();
      const items = entry.items ?? [];
      const icons = {general:"fa-sliders",definitions:"fa-shapes",content:"fa-box-open",rules:"fa-gears",orchestration:"fa-diagram-project",systems:"fa-wand-magic-sparkles",organization:"fa-tags",tools:"fa-screwdriver-wrench"};
      const groupLabel = label(entry.titleKey);
      const groupColor=sectionColor(ruleset,id);
      return {id, title:groupLabel, color:groupColor, icon:icons[id] ?? "fa-folder", count:items.length,
        items:items.map(item => ({...item,displayTitle:item.title, color:item.color || (item.collection?collectionColor(ruleset,item.collection):["definitionTypes","contentTypes"].includes(item.view)?collectionColor(ruleset,item.view):item.view.startsWith("definitions:")?sectionColor(ruleset,"definitions"):item.view.startsWith("content:")?sectionColor(ruleset,"content"):sectionColor(ruleset,id)),count:null,primary:(["definitionTypes","contentTypes"].includes(item.view))})),
        active:(id === "general" && this.#view === "general") || items.some(item=>item.active)};
    });
    const activeGroup=navGroups.find(group=>group.active)?.id;
    if (activeGroup) this.#navGroup=activeGroup;
    if (!navGroups.some(group=>group.id===this.#navGroup)) this.#navGroup="general";
    const currentNavGroup=navGroups.find(group=>group.id===this.#navGroup) ?? navGroups[0];
    let cards = [], currentTitle = "", currentKind = "", currentType = null;
    if (ruleset && this.#view === "definitionTypes") {
      currentTitle=label("RTA.Nav.DefinitionTypes"); currentKind="definitionType";
      cards = definitionTypes.map(row=>({...row,cardColor:row.color,image:row.image||""}));
    } else if (ruleset && this.#view === "contentTypes") {
      currentTitle=label("RTA.Nav.ContentTypes"); currentKind="contentType";
      cards = contentTypes.map(row=>({...row,cardColor:row.color,image:row.image||""}));
    } else if (ruleset && this.#view.startsWith("content:")) {
      const typeId=this.#view.slice("content:".length); currentType=contentTypes.find(type=>type.id===typeId)??null;
      if(!currentType)this.#view="contentTypes";
      else {
        currentTitle=currentType.name; currentKind="contentTemplate";
        cards=api.listContentTemplates(this.#selected).filter(entry=>entry.contentTypeId===typeId).map(entry=>({...entry,name:localize(api,this.#selected,entry.nameKey),typeName:currentType.name,cardColor:currentType.color,image:entry.image||currentType.image||""})).map(row=>({...row})).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name));
      }
    } else if (ruleset && this.#view.startsWith("definitions:")) {
      const typeId=this.#view.slice("definitions:".length); currentType=definitionTypes.find(type=>type.id===typeId)??null;
      if (!currentType) this.#view="definitionTypes";
      else {
        currentTitle=currentType.name; currentKind="definition";
        cards=api.listDefinitions(this.#selected).filter(entry=>entry.definitionTypeId===typeId).map(entry=>{
          const display=resolvePresentation(currentType.presentation,entry.presentationProfile,null);
          return {...entry,name:display.label||localize(api,this.#selected,entry.nameKey),typeName:currentType.name,
            cardColor:display.color||currentType.color,display,displayGroup:display.group??"",displayFormat:display.format??"",
            displayOrder:entry.order};
        }).sort((a,b)=>(a.displayOrder??0)-(b.displayOrder??0)||a.name.localeCompare(b.name));
      }
    } else if (ruleset) {
      const meta=TOP_LEVEL.find(item=>item.view===this.#view);
      if (meta) {
        currentTitle=label(meta.titleKey); currentKind=meta.kind;
        cards=(api[meta.list]?.(this.#selected)??[]).map(entry=>({
          ...entry,name:localize(api,this.#selected,entry.nameKey??entry.key??entry.id),cardColor:collectionColor(ruleset,meta.collection)
        })).map(row=>({...row})).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name));
      }
    }

    // Resolve only persisted tag references, preserving the tag's own color.
    const currentCollection=this.#view==='definitionTypes'?'definitionTypes':this.#view==='contentTypes'?'contentTypes':this.#view.startsWith('definitions:')?null:this.#view.startsWith('content:')?null:TOP_LEVEL.find(x=>x.view===this.#view)?.collection;
    const canOverrideCollection=!!currentCollection && mayOverrideSection(ruleset,sectionForCollection(currentCollection)) && record?.status!=='validated';
    const collectionAccent=currentCollection?collectionColor(ruleset,currentCollection):neutral;
    const collectionCustomAccent=currentCollection && !!ruleset?.familyColors?.[currentCollection];
    // Resolve only persisted tag references, preserving the tag's own color.
    const tagIndex = new Map((ruleset?.tags ?? []).map(tag => [tag.id, tag]));
    cards = cards.map(card => ({
      ...card,
      displayTags: (Array.isArray(card.tags) ? card.tags : []).map(id => {
        const tag = tagIndex.get(id);
        if (!tag) return null;
        return {id, name: localize(api, this.#selected, tag.nameKey ?? tag.key ?? tag.id), color: objectColor(ruleset,"tags",tag)};
      }).filter(Boolean)
    }));

    const activeTagIds = this.#tagFilters.get(this.#view) ?? new Set();
    const availableTags = buildFacet(cards, card => card.displayTags.map(tag => tag.id), id => {
      const tag=tagIndex.get(id);
      return {name:localize(api,this.#selected,tag?.nameKey??tag?.key??id),color:objectColor(ruleset,"tags",tag)};
    }, activeTagIds);
    // Category catalog facet (§47); ids that no longer resolve are not offered.
    const categoryIndex = new Map((ruleset?.categories ?? []).map(entry => [entry.id, entry]));
    const activeCategoryIds = this.#categoryFilters.get(this.#view) ?? new Set();
    const availableCategories = buildFacet(cards, card => Array.isArray(card.categories) ? card.categories : [], id => {
      const category=categoryIndex.get(id);
      return category ? {name:localize(api,this.#selected,category.nameKey||id)} : null;
    }, activeCategoryIds);
    const filteredCards=cards.filter(card=>matchesFacet(card.tags??[],activeTagIds)&&matchesFacet(card.categories??[],activeCategoryIds));

    const dependencyGroups = ruleset && this.#view === "dependencies"
      ? buildDependencyExplorer(ruleset,api.listDependencies(this.#selected),(entry)=>localize(api,this.#selected,entry.nameKey)||entry.name||entry.id)
      : [];
    // Resolve the same effective colors as collection cards: content/definition entries
    // inherit their type color, rather than a generic family fallback.
    const definitionColor = new Map(definitionTypes.map(type=>[type.id,type.color]));
    const contentColor = new Map(contentTypes.map(type=>[type.id,type.color]));
    const dependencyTagCounts = new Map();
    for(const group of dependencyGroups){
      const collection=({definition:'definitions',definitionType:'definitionTypes',contentTemplate:'contentTemplates',permissionPolicy:'permissionPolicies',eventType:'eventTypes',formulaBinding:'formulaBindings',creationSystem:'creationSystems',progressionSystem:'progressionSystems',sheetDefinition:'sheetDefinitions'})[group.kind] ?? `${group.kind}s`;
      const source=ruleset?.[collection]?.find(entry=>entry.id===group.id);
      group.tags=Array.isArray(source?.tags)?source.tags:[];
      group.cardColor=group.kind==='definition' ? (definitionColor.get(source?.definitionTypeId)||sectionColor(ruleset,"definitions"))
        : group.kind==='contentTemplate' ? (contentColor.get(source?.contentTypeId)||sectionColor(ruleset,"content"))
        : (group.kind==='definitionType'||group.kind==='contentType') ? objectColor(ruleset,collection,source)
        : collectionColor(ruleset,collection);
      for(const id of new Set(group.tags))if(tagIndex.has(id))dependencyTagCounts.set(id,(dependencyTagCounts.get(id)??0)+1);
    }
    const dependencyActiveTags=this.#tagFilters.get('dependencies')??new Set();
    const dependencyAvailableTags=[...dependencyTagCounts].map(([id,count])=>{
      const tag=tagIndex.get(id);
      return {id,count,name:localize(api,this.#selected,tag?.nameKey??tag?.key??id),color:objectColor(ruleset,"tags",tag),selected:dependencyActiveTags.has(id)};
    }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    const dependencyVisibleGroups=dependencyGroups.filter(group=>(!this.#dependencyUnresolvedOnly||group.unresolved>0)
      && (dependencyActiveTags.size===0||[...dependencyActiveTags].some(id=>group.tags.includes(id))));
    if(!dependencyVisibleGroups.some(group=>group.key===this.#dependencySelected))this.#dependencySelected=dependencyVisibleGroups[0]?.key??'';
    const dependencySelected=dependencyGroups.find(group=>group.key===this.#dependencySelected)??null;
    for(const group of dependencyGroups)group.selected=group.key===this.#dependencySelected;
    const dependencyGraph=buildDependencyGraph(dependencyGroups,this.#dependencySelected);
    const dependencyStats={consumers:dependencyGroups.length,relations:dependencyGroups.reduce((n,g)=>n+g.relationCount,0),unresolved:dependencyGroups.reduce((n,g)=>n+g.unresolved,0)};
    const dependencyUnresolvedOnly=this.#dependencyUnresolvedOnly;
    const isContentTypes=this.#view==="contentTypes";
    const isContentTemplates=this.#view.startsWith("content:");
    const isContentLibraries=isContentTypes||isContentTemplates;
    const actors = ruleset && this.#view === "runtimeLab" ? (game.actors?.contents??[]).map(actor=>({uuid:actor.uuid,id:actor.id,name:actor.name})) : [];
    if(actors.length){
      const source=applyRuntimeChoice(this.#runtimeSelection,"source",actors,{idOf:x=>x.uuid}),target=applyRuntimeChoice(this.#runtimeSelection,"target",actors,{fallbackIndex:1,idOf:x=>x.uuid});
      for(const actor of actors){actor.selectedSource=actor.uuid===source;actor.selectedTarget=actor.uuid===target;}
    }
    const selectedActorRef=this.#runtimeSelection.actorRole==="target"?(this.#runtimeSelection.target||this.#runtimeSelection.source):this.#runtimeSelection.source;
    const runtimeActorNames={source:actors.find(x=>x.uuid===this.#runtimeSelection.source)?.name??label("RTA.Lab.NoActorChosen"),target:actors.find(x=>x.uuid===this.#runtimeSelection.target)?.name??label("RTA.Lab.NoActorChosen")};
    const runtimeColorFor=ruleset&&this.#view==="runtimeLab"?createSelectColorResolver({definitionTypes:api.listDefinitionTypes(this.#selected),contentTypes:api.listContentTypes(this.#selected),familyColors:ruleset.familyColors??{},ruleset}):()=>[];
    const runtimeColors=(kind,entry)=>selectColorsAttribute(runtimeColorFor(kind,entry));
    const runtimeActions=ruleset&&this.#view==="runtimeLab"?api.listActions(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("action",x),selected:false})) : [];
    const runtimeFormulas=ruleset&&this.#view==="runtimeLab"?api.listFormulas(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("formula",x),selected:false})) : [];
    const runtimeConditions=ruleset&&this.#view==="runtimeLab"?api.listConditions(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("condition",x),selected:false})) : [];
    const runtimeTests=ruleset&&this.#view==="runtimeLab"?api.listTests(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("test",x),selected:false})) : [];
    const runtimeEvents=ruleset&&this.#view==="runtimeLab"?api.listEventTypes(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("eventType",x),selected:false})) : [];
    const runtimeProgressions=ruleset&&this.#view==="runtimeLab"?api.listProgressionSystems(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("progressionSystem",x),selected:false})) : [];
    for(const [key,list] of [["testId",runtimeTests],["formulaId",runtimeFormulas],["conditionId",runtimeConditions],["actionId",runtimeActions],["eventTypeId",runtimeEvents],["progressionId",runtimeProgressions]]){
      const chosen=applyRuntimeChoice(this.#runtimeSelection,key,list);for(const entry of list)entry.selected=entry.id===chosen;
    }
    let runtimeStateCards=[],runtimeStateError="";
    if(ruleset&&this.#view==="runtimeLab"&&selectedActorRef){
      try{const state=await game.ruleThemAll.runtimeLab.getContainerState(selectedActorRef,{rulesetVersionId:this.#selected});const byId=new Map((ruleset.definitions??[]).map(d=>[d.id,d]));runtimeStateCards=Object.values(state.definitionStates??{}).map(ds=>{const d=byId.get(ds.definitionId);const cap=ds.capabilityStates??{};return {id:ds.definitionId,name:d?localize(api,this.#selected,d.nameKey):ds.definitionId,hasValue:!!cap.value,base:cap.value?.base??0,pools:Object.entries(cap.pool??{}).map(([slotId,pool],_,all)=>({slotId,label:(d?.slots?.pool??[]).find(slot=>slot.id===slotId)?.name??(all.length>1?slotId:""),current:pool?.current??0})),hasState:!!cap.state,active:Boolean(cap.state?.active)};}).sort((a,b)=>a.name.localeCompare(b.name));}catch(error){runtimeStateError=game.i18n?.format?.("RTA.Lab.StateUnreadable",{error:error?.message??String(error)})??String(error);}
    }
    const runtimeTool=this.#runtimeSelection.tool||"test";
    // A parameterised Test reads the Definition it is asked for (variables.definition); an Action can be used from an owned Content (a weapon).
    const labTestId=runtimeTool==="action"?(ruleset?.actions??[]).find(x=>x.id===this.#runtimeSelection.actionId)?.testRef:this.#runtimeSelection.testId;
    const labAsksDefinition=["test","action"].includes(runtimeTool)&&((ruleset?.tests??[]).find(x=>x.id===labTestId)?.inputBindings??[]).some(input=>input.valueType==="reference");
    const runtimeDefinitionChoices=labAsksDefinition?[{id:"",name:label("RTA.Lab.NoDefinition"),selected:!this.#runtimeSelection.definitionId},...(ruleset.definitions??[]).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("definition",x),selected:x.id===this.#runtimeSelection.definitionId}))]:[];
    let runtimeContentChoices=[];
    if(ruleset&&this.#view==="runtimeLab"&&["test","action"].includes(runtimeTool)&&this.#runtimeSelection.source){
      try{const owned=await game.ruleThemAll.runtimeLab.listOwnedContents(this.#selected,this.#runtimeSelection.source);const names=new Map((ruleset.contentTemplates??[]).map(t=>[t.id,localize(api,this.#selected,t.nameKey)]));
        if(owned.length)runtimeContentChoices=[{id:"",name:label("RTA.Lab.NoContent"),selected:!this.#runtimeSelection.contentKey},...owned.map(row=>({id:row.key,name:`${names.get(row.templateId)??row.templateId}${row.available?"":` (${label("RTA.Lab.Unavailable")})`}`,selected:row.key===this.#runtimeSelection.contentKey}))];}catch{runtimeContentChoices=[];}
    }
    // An Action's inputs are asked in the Lab before it runs (a slot level, a difficulty).
    let runtimeInputRows=[];this.#runtimeInputSpecs=[];
    if(ruleset&&this.#view==="runtimeLab"&&runtimeTool==="action"&&this.#runtimeSelection.actionId&&(ruleset.actions??[]).find(x=>x.id===this.#runtimeSelection.actionId)?.inputs?.length){
      try{this.#runtimeInputSpecs=await game.ruleThemAll.runtimeLab.describeActionInputs(this.#selected,this.#runtimeSelection.actionId,this.#runtimeContext());
        runtimeInputRows=this.#runtimeInputSpecs.map(input=>{const chosen=this.#runtimeSelection.inputs[input.id]??(input.defaultValue===undefined?"":String(input.defaultValue));
          const options=input.valueType==="boolean"?[{value:"true",labelKey:label("RTA.Template.Yes")},{value:"false",labelKey:label("RTA.Template.No")}]:input.options;
          return {id:input.id,name:localize(api,this.#selected,input.labelKey),value:chosen,hasOptions:options.length>0,options:[...(input.required&&input.defaultValue!==undefined?[]:[{value:"",name:"—",selected:chosen===""}]),...options.map(option=>({value:String(option.value),name:option.labelKey?localize(api,this.#selected,option.labelKey):String(option.value),selected:String(option.value)===chosen}))]};});
      }catch(error){runtimeInputRows=[];this.#error=error?.message??String(error);}
    }
    // Reroll Actions that may replay the Lab's last executed Action.
    const lastUse=this.#runtimeLastUse,lastAction=lastUse&&(ruleset?.actions??[]).find(x=>x.id===lastUse.actionId);
    const runtimeRerolls=ruleset&&this.#view==="runtimeLab"&&runtimeTool==="action"&&lastAction?(ruleset.actions??[]).filter(x=>x.enabled!==false&&x.reroll&&(x.reroll.actionRefs?.length?x.reroll.actionRefs.includes(lastAction.id):Boolean(lastAction.testRef))).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("action",x),selected:x.id===this.#runtimeSelection.rerollId})):[];
    if(runtimeRerolls.length&&!runtimeRerolls.some(x=>x.selected))runtimeRerolls[0].selected=true;
    const runtimeLastUseName=lastAction?localize(api,this.#selected,lastAction.nameKey):"";
    // Progression: what Source / Self can buy now, and the milestones it reached.
    let runtimeProgression=null;
    if(ruleset&&this.#view==="runtimeLab"&&runtimeTool==="progression"&&this.#runtimeSelection.progressionId&&this.#runtimeSelection.source){
      try{const described=await game.ruleThemAll.runtimeLab.describeProgression(this.#selected,this.#runtimeSelection.progressionId,this.#runtimeSelection.source);
        const nameOf=id=>{const entry=(ruleset.definitions??[]).find(x=>x.id===id);return entry?localize(api,this.#selected,entry.nameKey):id;};
        runtimeProgression=progressionLabRows(described,{nameOf,text:key=>localize(api,this.#selected,key),i18n:(key,data)=>data?game.i18n?.format?.(key,data)??key:label(key),chosen:this.#runtimeSelection.milestoneInputs});
      }catch(error){this.#error=error?.message??String(error);}
    }
    const runtimeModes={isProgression:runtimeTool==="progression",isTest:runtimeTool==="test",isAction:runtimeTool==="action",isFormula:runtimeTool==="formula",isCondition:runtimeTool==="condition",isEvent:runtimeTool==="event",isRoll:runtimeTool==="roll",editSource:this.#runtimeSelection.actorRole!=="target",editTarget:this.#runtimeSelection.actorRole==="target"};
    const runtimeLists={progression:runtimeProgressions,test:runtimeTests,action:runtimeActions,formula:runtimeFormulas,condition:runtimeConditions,event:runtimeEvents};
    const runtimeGuide=label(runtimeTool==="roll"||runtimeLists[runtimeTool]?.length?`RTA.Lab.Guide.${runtimeTool}`:`RTA.Lab.Empty.${runtimeTool}`);
    const runtimeReady={source:!!this.#runtimeSelection.source,target:!!this.#runtimeSelection.target,test:!!this.#runtimeSelection.testId,action:!!this.#runtimeSelection.actionId,formula:!!this.#runtimeSelection.formulaId,condition:!!this.#runtimeSelection.conditionId,event:!!this.#runtimeSelection.eventTypeId,actors:!!(this.#runtimeSelection.source||this.#runtimeSelection.target)};
    return Object.assign(context,{
      error:this.#error,displayLines:this.#displayMode==="lines",displayTiles:this.#displayMode==="tiles",isWorkspace:!!ruleset,isRulesets:!ruleset,view:this.#view,rulesets,navigation,navGroups,currentNavGroup,definitionTypes,contentTypes,
      selectedRuleset:ruleset,selectedRecord:record,rulesetAccent:rulesetColor(ruleset),canOverrideCollection,currentCollection,collectionAccent,collectionCustomAccent,canEditRuleset:record?.status!=="validated",selectedRulesetName:ruleset?localize(api,this.#selected,ruleset.nameKey):"",
      isGeneral:!!ruleset&&this.#view==="general",isCollection:!!ruleset&&Boolean(currentKind),isContentFamily:currentKind==="contentTemplate",isDependencies:!!ruleset&&this.#view==="dependencies",isRuntimeLab:!!ruleset&&this.#view==="runtimeLab",isContentTypes,isContentTemplates,isContentLibraries,
      currentTitle,currentKind,currentType,canReorder:Boolean(record&&record.status!=="validated"&&currentKind),cards:filteredCards,availableTags,availableCategories,hasFacets:availableTags.length>0||availableCategories.length>0,hasActiveFilters:activeTagIds.size>0||activeCategoryIds.size>0,dependencyGroups:dependencyVisibleGroups,dependencySelected,dependencyGraph,dependencyStats,dependencyAvailableTags,dependencyActiveTagCount:dependencyActiveTags.size,dependencyUnresolvedOnly,actors,runtimeActions,runtimeFormulas,runtimeConditions,runtimeTests,runtimeEvents,runtimeDefinitionChoices,runtimeContentChoices,runtimeInputRows,runtimeRerolls,runtimeProgressions,runtimeProgression,runtimeLastUseName,runtimeResult:this.#runtimeResult,runtimeStateCards,runtimeSelection:this.#runtimeSelection,runtimeHasActorSubtypes:availableDocumentTypes("Actor").length>1,runtimeActorTypeOptions:availableDocumentTypes("Actor").map(id=>({id,label:documentTypeLabel("Actor",id),sourceSelected:id===this.#runtimeSelection.sourceType,targetSelected:id===this.#runtimeSelection.targetType})),runtimeTool,runtimeModes,runtimeGuide,runtimeReady,runtimeStateError,runtimeActorNames,
      publishReadiness:this.#view==='general'&&record?.status==='draft'?this.#publishReadiness(api,ruleset):null,
      recipes:this.#view==='general'&&record?recipeCards():null,
      lifecycle:record?{isValidated:record.status==="validated",isReady:record.status==="ready",isDraft:record.status==="draft",canMutate:record.status!=="validated",canCreateVersion:record.status==="validated",canActivate:Boolean(record.publishedSnapshot),isActive:record.versionId===activeId,statusLabel:statusLabel(record.status)}:null,
      storage:ruleset?{storageRevision:api.getStorageRevision(),activeVersionId:activeId,engineContractVersion:ruleset.engineContractVersion}:null
    });
  }

  #bindNav() {
    const root=this.element?.querySelector("[data-explorer]");
    if(!root)return;
    const panel=root.querySelector("[data-nav-panel]");
    const dismiss=()=>{panel.hidden=true;for(const button of root.querySelectorAll("[data-nav-group]"))button.setAttribute("aria-expanded","false");};
    const open=group=>{
      panel.hidden=false;
      for(const section of root.querySelectorAll("[data-flyout-group]"))section.hidden=section.dataset.flyoutGroup!==group;
      for(const button of root.querySelectorAll("[data-nav-group]"))button.setAttribute("aria-expanded",String(button.dataset.group===group));
      root.querySelector("[data-flyout-title]").textContent=root.querySelector(`[data-nav-group][data-group="${group}"]`)?.querySelector("span")?.textContent??"";
      for(const item of root.querySelectorAll("[data-nav-item]"))item.hidden=false;
      // Anchor to the full Foundry window, not to the sidebar's top edge.
      // Small menus stay level with the clicked family; tall menus rise into
      // the free space above the sidebar before their list starts scrolling.
      const bounds=root.getBoundingClientRect();
      const trigger=root.querySelector(`[data-nav-group][data-group="${group}"]`);
      const triggerBounds=trigger?.getBoundingClientRect();
      const windowHeader=this.element?.closest(".application")?.querySelector(".window-header");
      const headerBottom=windowHeader?.getBoundingClientRect().bottom;
      const topLimit=Number.isFinite(headerBottom)?headerBottom+8:bounds.top+8;
      const bottomLimit=bounds.bottom-8;
      const available=Math.max(120,bottomLimit-topLimit);
      const heading=panel.querySelector(".rta-explorer__flyout-heading");
      const list=panel.querySelector(".rta-explorer__flyout-list");
      const visible=panel.querySelector(`[data-flyout-group="${group}"]`);
      const listHeight=visible?.scrollHeight??0;
      const style=getComputedStyle(panel);
      const gap=parseFloat(style.rowGap)||10;
      const padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
      const natural=listHeight+(heading?.offsetHeight??0)+gap+padding+2;
      const desired=Math.min(available,Math.max(120,Math.ceil(natural)));
      const preferred=triggerBounds?.top??bounds.top;
      const absoluteTop=Math.max(topLimit,Math.min(preferred,bottomLimit-desired));
      panel.style.top=`${absoluteTop-bounds.top}px`;
      panel.style.maxHeight=`${available}px`;
      panel.style.height=`${desired}px`;
      if(list)list.scrollTop=0;
    };
    this._rtaNav={open,dismiss};
    root.querySelector("[data-nav-dismiss]")?.addEventListener("click",dismiss);
    this._rtaOutsideClick=event=>{if(!root.contains(event.target))dismiss();};
    this._rtaEscape=event=>{if(event.key==="Escape"&&!panel.hidden){event.preventDefault();event.stopPropagation();dismiss();}};
    document.addEventListener("pointerdown",this._rtaOutsideClick);
    document.addEventListener("keydown",this._rtaEscape,true);
  }
  #bind() {
    for (const element of this.element?.querySelectorAll?.("[data-action]") ?? []) element.addEventListener("click", event => this.#action(event));
    for (const card of this.element?.querySelectorAll?.(".rta-config-card[data-entry-id]") ?? []) card.addEventListener("contextmenu", event => this.#entryMenu(event, card));
    this.element?.querySelector?.("[data-import-file]")?.addEventListener("change", event => this.#import(event));
    const depSearch=this.element?.querySelector?.('[data-dependency-search]');
    if(depSearch){depSearch.value=this.#dependencySearch;depSearch.addEventListener('input',()=>{
      this.#dependencySearch=depSearch.value;const term=depSearch.value.trim().toLocaleLowerCase();
      for(const item of this.element.querySelectorAll('[data-dependency-item]'))item.hidden=!`${item.dataset.search}`.toLocaleLowerCase().includes(term);
    });depSearch.dispatchEvent(new Event('input'));}
    for(const input of this.element?.querySelectorAll?.('[data-collection-color]')??[])input.addEventListener('change',async event=>{
      try{
        const api=await this.#api(),record=api.getRulesetVersion(this.#selected),collection=event.currentTarget.dataset.collectionColor;
        if(!record||record.status==='validated'||!mayOverrideSection(record.workingDraft,sectionForCollection(collection)))throw new Error('Collection color override is unavailable.');
        const familyColors={...record.workingDraft.familyColors,[collection]:event.currentTarget.value};
        await api.updateRuleset(this.#selected,{familyColors});this.#rememberScroll();this.#restoreScroll=true;await this.render(false);
      }catch(error){this.#error=error.message;await this.render(false);}
    });
    this.#bindDependencyGraph();
    for(const input of this.element?.querySelectorAll?.("[data-runtime-select], [data-runtime-input]")??[])input.addEventListener("change",event=>{const key=event.currentTarget.dataset.runtimeSelect??event.currentTarget.dataset.runtimeInput;this.#runtimeSelection[key]=event.currentTarget.value;if(event.currentTarget.dataset.runtimeSelect)this.render(false);});
    for(const input of this.element?.querySelectorAll?.("[data-runtime-milestone-input]")??[])input.addEventListener("change",event=>{this.#runtimeSelection.milestoneInputs={...this.#runtimeSelection.milestoneInputs,[event.currentTarget.dataset.runtimeMilestoneInput]:event.currentTarget.value};});
    for(const input of this.element?.querySelectorAll?.("[data-runtime-action-input]")??[])input.addEventListener("change",event=>{this.#runtimeSelection.inputs={...this.#runtimeSelection.inputs,[event.currentTarget.dataset.runtimeActionInput]:event.currentTarget.value};});
  }

  #bindDependencyGraph(){
    const svg=this.element?.querySelector('[data-dependency-graph]');
    if(!svg)return;
    const viewport=svg.querySelector('[data-graph-viewport]');
    const initial=svg.viewBox.baseVal;
    const state={x:0,y:0,scale:1,drag:false,startX:0,startY:0,moved:false};
    const apply=()=>viewport.setAttribute('transform',`translate(${state.x} ${state.y}) scale(${state.scale})`);
    const zoom=(factor,anchor={x:initial.width/2,y:initial.height/2})=>{
      const next=Math.max(.45,Math.min(2.5,state.scale*factor));
      const ratio=next/state.scale;
      state.x=anchor.x-(anchor.x-state.x)*ratio;
      state.y=anchor.y-(anchor.y-state.y)*ratio;
      state.scale=next;apply();
    };
    for(const node of svg.querySelectorAll('[data-dependency-key]'))node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.click();}});
    svg.addEventListener('wheel',event=>{
      event.preventDefault();
      const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
      const matrix=svg.getScreenCTM();
      const anchor=matrix?point.matrixTransform(matrix.inverse()):{x:initial.width/2,y:initial.height/2};
      zoom(event.deltaY<0?1.1:.9,anchor);
    },{passive:false});
    svg.addEventListener('pointerdown',event=>{if(event.button!==0)return;state.drag=true;state.moved=false;state.startX=event.clientX;state.startY=event.clientY;svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!state.drag)return;const dx=event.clientX-state.startX,dy=event.clientY-state.startY;if(Math.abs(dx)+Math.abs(dy)>2)state.moved=true;const r=svg.getBoundingClientRect();state.x+=dx*initial.width/r.width;state.y+=dy*initial.height/r.height;state.startX=event.clientX;state.startY=event.clientY;apply();});
    svg.addEventListener('pointerup',()=>{state.drag=false;});
    svg.addEventListener('click',event=>{if(state.moved){event.stopPropagation();state.moved=false;}} ,true);
    this.element.querySelector('[data-graph-zoom-in]')?.addEventListener('click',()=>zoom(1.2));
    this.element.querySelector('[data-graph-zoom-out]')?.addEventListener('click',()=>zoom(1/1.2));
    this.element.querySelector('[data-graph-reset]')?.addEventListener('click',()=>{state.x=0;state.y=0;state.scale=1;apply();});
  }

  #bindDragDrop() {
    const cards=[...(this.element?.querySelectorAll?.("[data-orderable-card]")??[])];
    let dragged=null;
    for(const card of cards){
      card.addEventListener("dragstart",event=>{dragged=card;card.classList.add("rta-config-card--dragging");event.dataTransfer.effectAllowed="move";});
      card.addEventListener("dragend",()=>{card.classList.remove("rta-config-card--dragging");for(const c of cards)c.classList.remove("rta-config-card--drop-target");dragged=null;});
      card.addEventListener("dragover",event=>{if(!dragged||dragged===card)return;event.preventDefault();card.classList.add("rta-config-card--drop-target");});
      card.addEventListener("dragleave",()=>card.classList.remove("rta-config-card--drop-target"));
      card.addEventListener("drop",async event=>{event.preventDefault();card.classList.remove("rta-config-card--drop-target");if(!dragged||dragged===card)return;const grid=card.closest("[data-card-grid]");const rect=card.getBoundingClientRect();const before=event.clientX < rect.left+rect.width/2;grid.insertBefore(dragged,before?card:card.nextSibling);await this.#persistCardOrder(grid);});
    }
  }

  async #persistCardOrder(grid){
    try{
      const api=await this.#api(),kind=this.#currentCardKind();
      if(!kind)return;
      // One atomic write for the whole new sequence (orders 10, 20, 30...).
      await api.reorderEntries(this.#selected,kind,[...grid.querySelectorAll("[data-orderable-card]")].map(card=>card.dataset.entryId));
      await this.render(false);
    }catch(error){this.#error=error?.message??String(error);await this.render(false);}
  }

  #currentCardKind(){if(this.#view==="definitionTypes")return "definitionType";if(this.#view.startsWith("definitions:"))return "definition";if(this.#view==="contentTypes")return "contentType";if(this.#view.startsWith("content:"))return "contentTemplate";return TOP_LEVEL.find(item=>item.view===this.#view)?.kind??null;}

  #rememberScroll() {
    const area=this.element?.querySelector("[data-main-scroll]");
    if (area) this.#scroll.set(this.#view,{top:area.scrollTop,left:area.scrollLeft});
  }

  async #openEditor(kind,id=null,extra={}) {
    this.entryEditor?.close?.();this.#editorTarget=`${kind}|${id}`;
    this.entryEditor = new ConfiguratorEntryEditor({api:await this.#api(),versionId:this.#selected,kind,id,...extra,onSaved:async result=>{
      if(kind==="ruleset" && result?.versionId){
        if(id){this.#selected=result.versionId;this.#view="general";}
        else {this.#selected=result.versionId;this.#view="general";}
        await game.settings?.set(MODULE_ID,"configuratorSelectedRuleset",this.#selected);
      }
      await this.render(false);
    }});
    await this.entryEditor.render(true);
  }

  /** Right click on an entry: open it, or duplicate it under a name asked first. */
  #editorTarget="";
  async #entryMenu(event,card) {
    event.preventDefault();
    const kind=card.dataset.kind,id=card.dataset.entryId,name=card.querySelector(".rta-config-card__title")?.textContent?.trim()??id;
    const record=(await this.#api()).getRulesetVersion(this.#selected),i18n=game.i18n;
    const items=[{label:i18n.localize("RTA.UI.Edit"),icon:"fa-solid fa-pen-to-square",run:()=>this.#openEditor(kind,id)}];
    if(record?.status!=="validated")items.push({label:i18n.localize("RTA.UI.DuplicateEntry"),icon:"fa-solid fa-copy",run:()=>this.#duplicate(kind,id,name)},{label:i18n.localize("RTA.Template.Delete"),icon:"fa-solid fa-trash",run:()=>this.#delete(kind,id,name)});
    openContextMenu(event,items);
  }
  async #duplicate(kind,id,name) {
    this.#error="";
    try {
      const copyName=await promptRTA("RTA.UI.DuplicateName",game.i18n.format("RTA.UI.CopyOf",{name}));
      if(copyName===null)return;
      if(!String(copyName).trim())throw new Error(game.i18n.localize("RTA.UI.DuplicateNameRequired"));
      const copy=await (await this.#api()).duplicateEntry(this.#selected,kind,id,String(copyName).trim());
      await this.render(false);
      return this.#openEditor(kind,copy.id);
    } catch(error){this.#error=error?.message??String(error);return this.render(false);}
  }

  /** Delete from the right-click menu: refused ahead with who still uses it, else confirmed first. */
  async #delete(kind,id,name) {
    this.#error="";
    try {
      const api=await this.#api(),view=entryDeletionView(api,this.#selected,kind,id);
      if(view.blocked)return ui.notifications?.warn?.(view.reason);
      if(!await confirmRTA("RTA.UI.DeleteNamedEntry",{name}))return;
      if(await deleteRulesetEntry(api,this.#selected,kind,id,confirmRTA)===false)return;
      if(this.#editorTarget===`${kind}|${id}`)this.entryEditor?.close?.();
      return this.render(false);
    } catch(error){this.#error=error?.message??String(error);return this.render(false);}
  }

  async #action(event) {
    const button=event.currentTarget, action=button.dataset.action; this.#error="";
    try {
      const api=await this.#api();
      if (action==="toggleTagFilter"||action==="toggleCategoryFilter") {
        const isTag=action==="toggleTagFilter";
        toggleFacet(isTag?this.#tagFilters:this.#categoryFilters,this.#view,isTag?button.dataset.tagId:button.dataset.categoryId);
        this.#rememberScroll();this.#restoreScroll=true;
        return this.render(false);
      }
      if (action==="clearFilters") {
        this.#categoryFilters.delete(this.#view);this.#tagFilters.delete(this.#view);
        this.#rememberScroll();this.#restoreScroll=true;
        return this.render(false);
      }
      if (action==="importRuleset") return this.element?.querySelector?.("[data-import-file]")?.click();
      if (action==="clearTagFilters") {
        this.#tagFilters.delete(this.#view);
        this.#rememberScroll();this.#restoreScroll=true;
        return this.render(false);
      }
      if (action==="toggleDependencyUnresolved") {
        this.#dependencyUnresolvedOnly=!this.#dependencyUnresolvedOnly;
        this.#dependencyListScroll=0;
        return this.render(false);
      }
      if (action==="selectDependency") {
        // A second click on the same node within a double-click delay opens its editor (§46).
        // The first click re-renders the graph, so a native dblclick never reaches the new node.
        const now=Date.now(),key=button.dataset.dependencyKey,last=this.#dependencyClick;this.#dependencyClick={key,time:now};
        if(last?.key===key&&now-last.time<450&&button.dataset.nodeKind){this.#dependencyClick=null;return this.#openEditor(button.dataset.nodeKind,button.dataset.nodeId);}this.#dependencyListScroll=this.element?.querySelector('.rta-dependencies__items')?.scrollTop??0;this.#dependencySelected=button.dataset.dependencyKey;return this.render(false);}
      if (action==="setDisplayMode") { this.#displayMode=button.dataset.mode==="lines"?"lines":"tiles"; return this.render(false); }
      if (action==="openWorkspace") { this.#selected=button.dataset.versionId; this.#view="general"; await game.settings?.set(MODULE_ID,"configuratorSelectedRuleset",this.#selected); return this.render(false); }
      if (action==="backToRulesets") { this.#selected=""; this.#view="general"; await game.settings?.set(MODULE_ID,"configuratorSelectedRuleset",""); return this.render(false); }
      if (action==="navGroup") { const panel=this.element?.querySelector("[data-nav-panel]"); if(panel&&!panel.hidden&&button.getAttribute("aria-expanded")==="true")this._rtaNav?.dismiss();else this._rtaNav?.open(button.dataset.group); return; }
      if (action==="navigate") { this.#rememberScroll(); this.#view=button.dataset.view; this.#restoreScroll=true; return this.render(false); }
      if (action==="closeConfigurator") return this.close();
      if (action==="addRuleset") return this.#openEditor("ruleset");
      if (action==="editRuleset") return this.#openEditor("ruleset",this.#selected);
      if(action==='resetCollectionColor') {
        const record=api.getRulesetVersion(this.#selected);
        if(record?.status==='validated')throw new Error('Validated Ruleset is read-only.');
        const collection=button.dataset.collection;
        if(!mayOverrideSection(record?.workingDraft,sectionForCollection(collection)))throw new Error('Collection color override is disabled.');
        const familyColors={...record.workingDraft.familyColors};delete familyColors[collection];
        await api.updateRuleset(this.#selected,{familyColors});return this.render(false);
      }
      if (action==="addEntry") return this.#openEditor(button.dataset.kind,null,{definitionTypeId:button.dataset.definitionTypeId??null,contentTypeId:button.dataset.contentTypeId??null});
      if (action==="openEntry") return this.#openEditor(button.dataset.kind,button.dataset.entryId);
      if (action==="openDiagnostic") return this.#openEditor(button.dataset.kind,button.dataset.entryId,{focusPath:button.dataset.path??""});
      if (action==="publish") { await api.publishRuleset(button.dataset.versionId??this.#selected); return this.render(false); }
      if (action==="validate") { await api.validateRulesetVersion(button.dataset.versionId??this.#selected); return this.render(false); }
      if (action==="applyRecipe") {
        const recipeId=button.dataset.recipeId,i18n=game.i18n;
        if(!await confirmRTA("RTA.Recipe.Confirm",{title:i18n.localize(`RTA.Recipe.${recipeId}.Title`)}))return;
        const created=await api.applyRecipe(this.#selected,recipeId,Object.fromEntries(recipeTextKeys(recipeId).map(key=>[key,i18n.localize(key)])));
        ui.notifications?.info?.(i18n.format("RTA.Recipe.Applied",{count:created.length}));this.#error="";return this.render(false);
      }
      if (action==="createNewVersion") {
        const source=button.dataset.versionId??this.#selected;
        const record=api.getRulesetVersion(source);
        const suggested=record?.version?`${record.version}-next`:"next";
        const version=await promptRTA("RTA.UI.NewVersion",suggested);
        if(version===null)return;
        if(!String(version).trim())throw new Error("Version is required.");
        const created=await api.createNewRulesetVersion(source,String(version).trim());
        this.#selected=created.versionId;this.#view="general";
        await game.settings?.set(MODULE_ID,"configuratorSelectedRuleset",this.#selected);
        return this.render(false);
      }
      if (action==="activate") { await api.setActiveVersionId(button.dataset.versionId??this.#selected); return this.render(false); }
      if (action==="deactivate") { await api.setActiveVersionId(null); return this.render(false); }
      if (action==="deleteRuleset") {
        const id=button.dataset.versionId??this.#selected;
        const isActive=api.getActiveVersionId()===id;
        if (!await confirmRTA(isActive?"RTA.UI.DeleteActiveRuleset":"RTA.UI.DeleteRuleset")) return;
        if(isActive)await api.setActiveVersionId(null);
        await api.deleteRulesetVersion(id);
        if(this.#selected===id){this.#selected="";await game.settings?.set(MODULE_ID,"configuratorSelectedRuleset","");}
        return this.render(false);
      }
      if (action==="syncContentLibraries") {
        if(!game.ruleThemAll?.content?.syncAll)throw new Error("Foundry content synchronization is unavailable.");
        const results=await game.ruleThemAll.content.syncAll(this.#selected);
        const created=results.reduce((n,x)=>n+(x.created??0),0),updated=results.reduce((n,x)=>n+(x.updated??0),0),deleted=results.reduce((n,x)=>n+(x.deleted??0),0);
        this.#error="";ui.notifications?.info?.(`Rule Them'All content libraries synchronized: ${created} created, ${updated} updated, ${deleted} removed.`);
        return this.render(false);
      }
      if (action==="runtimeCreateActors") {
        if(typeof game.ruleThemAll.runtimeLab.createTestActors!=="function")throw new Error(label("RTA.Lab.Error.NoTestActors"));
        const result=await game.ruleThemAll.runtimeLab.createTestActors({sourceType:this.#runtimeSelection.sourceType||null,targetType:this.#runtimeSelection.targetType||null});
        const {source,target}=result;
        this.#runtimeSelection.source=source.uuid;this.#runtimeSelection.target=target.uuid;
        let created=0;
        const record=api.getRulesetVersion(this.#selected),ruleset=record?.workingDraft??record?.publishedSnapshot;
        for(const [ref,role] of [[source.uuid,"source"],[target.uuid,"target"]]){
          if(!ref)continue;const init=await game.ruleThemAll.runtimeLab.initializeContainer(this.#selected,ref);created+=init.created??0;
          const profile=buildRuntimeLabDemoProfile(ruleset,role);
          for(const [definitionId,values] of Object.entries(profile))await game.ruleThemAll.runtimeLab.setDefinitionState(this.#selected,ref,definitionId,values);
        }
        return this.#runtimeShow("actorsReady",{source:source.name,target:target.name,created});
      }
      if (action==="runtimeInitAll"||action==="runtimeReset") {
        const refs=this.#runtimeActorRefs();
        if(action==="runtimeReset")for(const ref of refs)await game.ruleThemAll.runtimeLab.resetContainer(ref);
        let created=0;
        for(const ref of refs)created+=(await game.ruleThemAll.runtimeLab.initializeContainer(this.#selected,ref)).created??0;
        return this.#runtimeShow(action==="runtimeReset"?"reset":"initialized",{created,actors:refs.length});
      }
      if (action==="runtimeUpdateState") {
        const ref=this.#runtimeSelection.actorRole==="target"?(this.#runtimeSelection.target||this.#runtimeSelection.source):this.#runtimeSelection.source,id=button.dataset.definitionId;
        if(!ref)throw new Error(label("RTA.Lab.Error.ChooseActor"));
        const row=button.closest("[data-runtime-state-row]");const options={};
        const base=row?.querySelector('[name="runtimeStateBase"]');const pools=[...(row?.querySelectorAll('[name="runtimeStatePool"]')??[])];const active=row?.querySelector('[name="runtimeStateActive"]');
        if(base)options.base=Number(base.value);if(pools.length)options.pools=Object.fromEntries(pools.map(input=>[input.dataset.slotId,Number(input.value)]));if(active)options.active=active.checked;
        await game.ruleThemAll.runtimeLab.setDefinitionState(this.#selected,ref,id,options);
        return this.#runtimeShow("saved",{name:row?.querySelector("strong")?.textContent??id});
      }
      const runtimeId=key=>{const id=this.#runtimeSelection[key];if(!id)throw new Error(label(`RTA.Lab.Error.Choose.${key}`));return id;};
      if (action==="runtimeFormula") return this.#runtimeShow("formula",{value:await game.ruleThemAll.runtimeLab.evaluateFormula(this.#selected,runtimeId("formulaId"),this.#runtimeContext())});
      if (action==="runtimeCondition") return this.#runtimeShow("condition",{value:await game.ruleThemAll.runtimeLab.evaluateCondition(this.#selected,runtimeId("conditionId"),this.#runtimeContext())});
      if (action==="runtimePreviewAction"||action==="runtimeExecuteAction") {
        const id=runtimeId("actionId"),preview=action==="runtimePreviewAction";
        const context=this.#runtimeContext(),result=preview?await game.ruleThemAll.runtimeLab.previewAction(this.#selected,id,context):await game.ruleThemAll.runtimeLab.executeAction(this.#selected,id,context);
        if(!preview&&result.allowed&&result.use)this.#runtimeLastUse=result.use;
        return this.#runtimeShow("action",{...result,preview});
      }
      if (action==="runtimeAdvance") {
        const {advancement,definition}=button.dataset,result=await game.ruleThemAll.runtimeLab.advance(this.#selected,runtimeId("progressionId"),this.#runtimeSelection.source,advancement,definition);
        return this.#runtimeShow("progression",{...result,name:button.dataset.name});
      }
      if (action==="runtimeMilestones") {
        const choices={};for(const [key,value] of Object.entries(this.#runtimeSelection.milestoneInputs)){const [milestoneId,inputId]=key.split("|");if(value!=="")(choices[milestoneId]??={})[inputId]=value;}
        return this.#runtimeShow("milestones",await game.ruleThemAll.runtimeLab.applyMilestones(this.#selected,runtimeId("progressionId"),this.#runtimeSelection.source,{choices}));
      }
      if (action==="runtimeReroll") {
        const use=this.#runtimeLastUse,rerollId=String(this.element.querySelector('[data-runtime-select="rerollId"]')?.value??"");
        if(!use||!rerollId)throw new Error(label("RTA.Lab.Error.Choose.actionId"));
        const result=await game.ruleThemAll.runtimeLab.rerollAction(this.#selected,rerollId,use,this.#runtimeContext());
        if(result.allowed&&result.use)this.#runtimeLastUse=result.use;
        return this.#runtimeShow("action",{...result,preview:false});
      }
      if (action==="runtimeTest") return this.#runtimeShow("test",await game.ruleThemAll.runtimeLab.executeTest(this.#selected,runtimeId("testId"),this.#runtimeContext()));
      if (action==="runtimeRoll") {
        const formula=String(this.element.querySelector('[name="runtimeRollFormula"]')?.value??this.#runtimeSelection.rollFormula??"").trim();this.#runtimeSelection.rollFormula=formula;
        if(!formula)throw new Error(label("RTA.Lab.Error.Choose.rollFormula"));
        return this.#runtimeShow("roll",await game.ruleThemAll.runtimeLab.roll(formula,{}));
      }
      if (action==="runtimeEvent") return this.#runtimeShow("event",await game.ruleThemAll.runtimeLab.emitEvent(this.#selected,runtimeId("eventTypeId"),{},this.#runtimeContext()));
      if (action==="export") {
        const id=button.dataset.versionId??this.#selected; const payload=api.exportRuleset(id,{includeWorldLocalizations:true});
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=`rta-ruleset-${id}.json`;a.click();URL.revokeObjectURL(url); return;
      }
    } catch(error) {
      let message=error?.message??String(error);
      if(message.startsWith("Definition is not instantiated on RuntimeContainer:"))message+=` ${label("RTA.Lab.Error.InitializeHint")}`;
      // Lab errors belong next to the operation that failed, in its result step.
      if(action?.startsWith("runtime"))return this.#runtimeShow("error",{message});
      this.#error=message; return this.render(false);
    }
  }

  #runtimeActorRefs(){
    const refs=[...new Set([this.#runtimeSelection.source,this.#runtimeSelection.target].filter(Boolean))];
    if(!refs.length)throw new Error(label("RTA.Lab.Error.ChooseActor"));
    return refs;
  }

  async #runtimeShow(kind,data){
    const api=await this.#api(),record=api.getRulesetVersion(this.#selected),ruleset=record?.workingDraft??record?.publishedSnapshot;
    const i18n=(key,values)=>values?game.i18n?.format?.(key,values)??key:label(key);
    const nameOf=(collection,id)=>{const entry=(ruleset?.[collection]??[]).find(x=>x.id===id);return entry?.nameKey?localize(api,this.#selected,entry.nameKey):String(id??"");};
    this.#runtimeResult=describeRuntimeResult(kind,data,{i18n,nameOf});
    return this.render(false);
  }

  #runtimeContext(){const source=this.#runtimeSelection.source,target=this.#runtimeSelection.target||source,{definitionId,contentKey}=this.#runtimeSelection;
    const variables={...(definitionId?{definition:{objectKind:"definition",objectId:definitionId}}:{})},input=this.#runtimeInputValues();if(Object.keys(input).length)variables.input=input;
    return {roles:{self:source,source,target,subject:target,owner:source},defaultRole:"self",userContext:{userId:game.user?.id??null,isGM:Boolean(game.user?.isGM)},
      ...(Object.keys(variables).length?{variables}:{}),...(contentKey?{content:{key:contentKey,role:"self"}}:{})};}
  /** The Lab's answers to the selected Action's inputs, typed; an empty answer is left to the input's default. */
  #runtimeInputValues(){
    const values={};
    for(const input of this.#runtimeInputSpecs){const raw=String(this.#runtimeSelection.inputs[input.id]??"").trim();if(raw==="")continue;
      values[input.id]=["number","integer"].includes(input.valueType)?Number(raw):input.valueType==="boolean"?raw==="true":raw;}
    return values;
  }

  async #import(event) {
    const file=event.currentTarget.files?.[0]; if(!file)return;
    try { const api=await this.#api(); const payload=JSON.parse(await file.text()); await api.importRuleset(payload,"NEW"); await this.render(false); }
    catch(error){ this.#error=error?.message??String(error); await this.render(false); }
  }
}
