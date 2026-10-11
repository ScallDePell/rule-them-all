import {resolvePresentation} from "./declarative-contracts.mjs";
import {buildFacet, matchesFacet, toggleFacet} from "./card-facets.mjs";
import {availableDocumentTypes} from "../core/system-document-types.mjs";
import {escapeHTML} from "../ui/html-utils.mjs";
import {RTA_NEUTRAL_COLOR} from "../ui/theme-tokens.mjs";
import {RULESET_SECTIONS,rulesetColor,sectionColor,collectionColor,objectColor,sectionForCollection,mayOverrideSection} from "./ruleset-colors.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {createSelectColorResolver,selectColorsAttribute} from "../ui/select-option-presentation.mjs";
import {buildDependencyExplorer,buildDependencyGraph} from "./dependency-explorer.mjs";
import {confirmRTA, promptRTA} from "./foundry-dialogs.mjs";
import {ConfiguratorWindow} from "./configurator-window.mjs";
import {ConfiguratorEntryEditor} from "./configurator-entry-editor.mjs";
import {buildRuntimeLabDemoProfile} from "../runtime/runtime-demo-profile.mjs";


const neutral = RTA_NEUTRAL_COLOR;
const label = key => game.i18n?.localize?.(key) ?? key;
const slug = value => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const uid = prefix => `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;


const TOP_LEVEL = Object.freeze([
  {view:"parameters", kind:"parameter", title:"Parameters", list:"listParameters", collection:"parameters"},
  {view:"formulas", kind:"formula", title:"Formulas", list:"listFormulas", collection:"formulas"},
  {view:"formulaBindings", kind:"formulaBinding", title:"Derived Outputs", list:"listFormulaBindings", collection:"formulaBindings"},
  {view:"conditions", kind:"condition", title:"Conditions", list:"listConditions", collection:"conditions"},
  {view:"rolls", kind:"roll", title:"Rolls", list:"listRolls", collection:"rolls"},
  {view:"outcomes", kind:"outcome", title:"Outcomes", list:"listOutcomes", collection:"outcomes"},
  {view:"tests", kind:"test", title:"Tests", list:"listTests", collection:"tests"},
  {view:"effects", kind:"effect", title:"Effects", list:"listEffects", collection:"effects"},
  {view:"actions", kind:"action", title:"Actions", list:"listActions", collection:"actions"},
  {view:"permissions", kind:"permissionPolicy", title:"Permissions", list:"listPermissionPolicys", collection:"permissionPolicies"},
  {view:"events", kind:"eventType", title:"Event Types", list:"listEventTypes", collection:"eventTypes"},
  {view:"triggers", kind:"trigger", title:"Triggers", list:"listTriggers", collection:"triggers"},
  {view:"modifiers", kind:"modifier", title:"Modifiers", list:"listModifiers", collection:"modifiers"},
  {view:"restrictions", kind:"restriction", title:"Restrictions", list:"listRestrictions", collection:"restrictions"},
  {view:"durations", kind:"duration", title:"Durations", list:"listDurations", collection:"durations"},
  {view:"creationSystems", kind:"creationSystem", title:"Creation Systems", list:"listCreationSystems", collection:"creationSystems"},
  {view:"progressionSystems", kind:"progressionSystem", title:"Progression Systems", list:"listProgressionSystems", collection:"progressionSystems"},
  {view:"sheetDefinitions", kind:"sheetDefinition", title:"Sheet Builder", list:"listSheetDefinitions", collection:"sheetDefinitions"},
  {view:"contentTypes", kind:"contentType", title:"Content Types", list:"listContentTypes", collection:"contentTypes"},
  {view:"categories", kind:"category", title:"Categories", list:"listCategories", collection:"categories"},
  {view:"tags", kind:"tag", title:"Tags", list:"listTags", collection:"tags"},
  {view:"references", kind:"reference", title:"References", list:"listReferences", collection:"references"}
]);

function localize(api, versionId, key) {
  if (!key) return "";
  try { return api.resolveLocalizedText(versionId, game.i18n?.lang ?? "en", key, value => label(value)); }
  catch { return label(key); }
}

function cardTooltip(row) {
  const details = [row.name, `ID: ${row.id}`];
  if (row.key) details.push(`Key: ${row.key}`);
  if (row.typeName) details.push(`Type: ${row.typeName}`);
  if (row.enabled === false) details.push("Disabled");
  return details.map(escapeHTML).join("<br>");
}

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
  #runtimeSelection = {source:"",target:"",definitionId:"",actionId:"",formulaId:"",conditionId:"",testId:"",eventTypeId:"",rollFormula:"",sourceType:"",targetType:"",actorRole:"source",tool:"test"};
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
      return {objectLabel: name, message: entry.message};
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
      canDelete:true, canCreateVersion:record.status==="validated"
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
        {view:'definitionTypes',title:'Definition Types',active:this.#view==='definitionTypes'},
        ...definitionTypes.map(type=>({view:`definitions:${type.id}`,title:type.name,active:type.active,color:type.color}))
      ];
      else if(section.id==='content')items=[
        {view:'contentTypes',title:'Content Types',active:this.#view==='contentTypes'},
        ...contentTypes.map(type=>({view:`content:${type.id}`,title:type.name,active:type.active,color:type.color}))
      ];
      else if(section.id==='runtime')items=[{view:'runtimeLab',title:'Runtime Lab',active:this.#view==='runtimeLab'}];
      else {
        items=TOP_LEVEL.filter(item=>section.collections.includes(item.collection)&&!['contentTypes'].includes(item.collection))
          .map(item=>({...item,active:this.#view===item.view}));
        if(section.id==='advanced')items.push({view:'dependencies',title:'Dependencies',active:this.#view==='dependencies'});
      }
      return {group:section.id,titleKey:section.titleKey,items};
    }) : [];

    const navGroups = navigation.map(entry => {
      const id = entry.view ?? entry.group.toLowerCase();
      const items = entry.items ?? [];
      const icons = {general:"fa-sliders",definitions:"fa-shapes",content:"fa-box-open",rules:"fa-gears",orchestration:"fa-diagram-project",systems:"fa-wand-magic-sparkles",runtime:"fa-flask",advanced:"fa-screwdriver-wrench"};
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
      currentTitle="Definition Types"; currentKind="definitionType";
      cards = definitionTypes.map(row=>({...row,tooltipHtml:cardTooltip(row),cardColor:row.color,image:row.image||""}));
    } else if (ruleset && this.#view === "contentTypes") {
      currentTitle="Content Types"; currentKind="contentType";
      cards = contentTypes.map(row=>({...row,tooltipHtml:cardTooltip(row),cardColor:row.color,image:row.image||""}));
    } else if (ruleset && this.#view.startsWith("content:")) {
      const typeId=this.#view.slice("content:".length); currentType=contentTypes.find(type=>type.id===typeId)??null;
      if(!currentType)this.#view="contentTypes";
      else {
        currentTitle=currentType.name; currentKind="contentTemplate";
        cards=api.listContentTemplates(this.#selected).filter(entry=>entry.contentTypeId===typeId).map(entry=>({...entry,name:localize(api,this.#selected,entry.nameKey),typeName:currentType.name,cardColor:currentType.color,image:entry.image||currentType.image||"",tooltipHtml:""})).map(row=>({...row,tooltipHtml:cardTooltip(row)})).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name));
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
            displayOrder:display.order??entry.order,tooltipHtml:""};
        }).map(row=>({...row,tooltipHtml:cardTooltip(row)}))
          .sort((a,b)=>(a.displayOrder??0)-(b.displayOrder??0)||a.name.localeCompare(b.name));
      }
    } else if (ruleset) {
      const meta=TOP_LEVEL.find(item=>item.view===this.#view);
      if (meta) {
        currentTitle=meta.title; currentKind=meta.kind;
        cards=(api[meta.list]?.(this.#selected)??[]).map(entry=>({
          ...entry,name:localize(api,this.#selected,entry.nameKey??entry.key??entry.id),cardColor:collectionColor(ruleset,meta.collection),tooltipHtml:""
        })).map(row=>({...row,tooltipHtml:cardTooltip(row)})).sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name));
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
    const actors = ruleset && this.#view === "runtimeLab" ? (game.actors?.contents??[]).map(actor=>({uuid:actor.uuid,id:actor.id,name:actor.name,selectedSource:this.#runtimeSelection.source===actor.uuid,selectedTarget:this.#runtimeSelection.target===actor.uuid})) : [];
    if(actors.length&&!this.#runtimeSelection.source)this.#runtimeSelection.source=actors[0].uuid;if(actors.length&&!this.#runtimeSelection.target)this.#runtimeSelection.target=actors[Math.min(1,actors.length-1)].uuid;
    const selectedActorRef=this.#runtimeSelection.actorRole==="target"?(this.#runtimeSelection.target||this.#runtimeSelection.source):this.#runtimeSelection.source;
    const selectedActorName=actors.find(x=>x.uuid===selectedActorRef)?.name??"Actor";
    const runtimeColorFor=ruleset&&this.#view==="runtimeLab"?createSelectColorResolver({definitionTypes:api.listDefinitionTypes(this.#selected),contentTypes:api.listContentTypes(this.#selected),familyColors:ruleset.familyColors??{},ruleset}):()=>[];
    const runtimeColors=(kind,entry)=>selectColorsAttribute(runtimeColorFor(kind,entry));
    const runtimeDefinitions=ruleset&&this.#view==="runtimeLab"?api.listDefinitions(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("definition",x),selected:this.#runtimeSelection.definitionId===x.id})) : [];
    const runtimeActions=ruleset&&this.#view==="runtimeLab"?api.listActions(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("action",x),selected:this.#runtimeSelection.actionId===x.id})) : [];
    const runtimeFormulas=ruleset&&this.#view==="runtimeLab"?api.listFormulas(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("formula",x),selected:this.#runtimeSelection.formulaId===x.id})) : [];
    const runtimeConditions=ruleset&&this.#view==="runtimeLab"?api.listConditions(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("condition",x),selected:this.#runtimeSelection.conditionId===x.id})) : [];
    const runtimeTests=ruleset&&this.#view==="runtimeLab"?api.listTests(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("test",x),selected:this.#runtimeSelection.testId===x.id})) : [];
    const runtimeEvents=ruleset&&this.#view==="runtimeLab"?api.listEventTypes(this.#selected).filter(x=>x.enabled!==false).map(x=>({id:x.id,name:localize(api,this.#selected,x.nameKey),colors:runtimeColors("eventType",x),selected:this.#runtimeSelection.eventTypeId===x.id})) : [];
    if(runtimeDefinitions.length&&!this.#runtimeSelection.definitionId)this.#runtimeSelection.definitionId=runtimeDefinitions[0].id;
    if(runtimeTests.length&&!this.#runtimeSelection.testId)this.#runtimeSelection.testId=runtimeTests[0].id;
    if(runtimeFormulas.length&&!this.#runtimeSelection.formulaId)this.#runtimeSelection.formulaId=runtimeFormulas[0].id;
    if(runtimeConditions.length&&!this.#runtimeSelection.conditionId)this.#runtimeSelection.conditionId=runtimeConditions[0].id;
    if(runtimeActions.length&&!this.#runtimeSelection.actionId)this.#runtimeSelection.actionId=runtimeActions[0].id;
    if(runtimeEvents.length&&!this.#runtimeSelection.eventTypeId)this.#runtimeSelection.eventTypeId=runtimeEvents[0].id;
    let runtimeStateCards=[];
    if(ruleset&&this.#view==="runtimeLab"&&selectedActorRef){
      try{const state=await game.ruleThemAll.runtimeLab.getContainerState(selectedActorRef,{rulesetVersionId:this.#selected});const byId=new Map((ruleset.definitions??[]).map(d=>[d.id,d]));runtimeStateCards=Object.values(state.definitionStates??{}).map(ds=>{const d=byId.get(ds.definitionId);const cap=ds.capabilityStates??{};return {id:ds.definitionId,name:d?localize(api,this.#selected,d.nameKey):ds.definitionId,hasValue:!!cap.value,base:cap.value?.base??0,pools:Object.entries(cap.pool??{}).map(([slotId,pool])=>({slotId,current:pool?.current??0})),hasState:!!cap.state,active:Boolean(cap.state?.active)};}).sort((a,b)=>a.name.localeCompare(b.name));}catch{}
    }
    const runtimeTool=this.#runtimeSelection.tool||"test";
    const runtimeModes={isTest:runtimeTool==="test",isAction:runtimeTool==="action",isFormula:runtimeTool==="formula",isCondition:runtimeTool==="condition",isEvent:runtimeTool==="event",isRoll:runtimeTool==="roll",editSource:this.#runtimeSelection.actorRole!=="target",editTarget:this.#runtimeSelection.actorRole==="target"};
    const runtimeGuide={
      test:runtimeTests.length?"Choose a configured Test, then run it. Source / Self supplies the tested values; Target is available to the rule context.":"This Ruleset has no configured Tests yet.",
      action:runtimeActions.length?"Preview an Action first. Execute only when the proposed changes look correct.":"This Ruleset has no configured Actions yet.",
      formula:runtimeFormulas.length?"Evaluate a Formula against Source / Self to inspect a calculated value.":"This Ruleset has no configured Formulas yet.",
      condition:runtimeConditions.length?"Evaluate a Condition against Source / Self. The result is TRUE or FALSE.":"This Ruleset has no configured Conditions yet.",
      event:runtimeEvents.length?"Emit an Event and inspect which configured Triggers fire.":"This Ruleset has no configured Event Types yet.",
      roll:"Use this only to verify Foundry dice independently of configured ruleset rules."
    }[runtimeTool];
    return Object.assign(context,{
      error:this.#error,displayLines:this.#displayMode==="lines",displayTiles:this.#displayMode==="tiles",isWorkspace:!!ruleset,isRulesets:!ruleset,view:this.#view,rulesets,navigation,navGroups,currentNavGroup,definitionTypes,contentTypes,
      selectedRuleset:ruleset,selectedRecord:record,rulesetAccent:rulesetColor(ruleset),canOverrideCollection,currentCollection,collectionAccent,collectionCustomAccent,canEditRuleset:record?.status!=="validated",selectedRulesetName:ruleset?localize(api,this.#selected,ruleset.nameKey):"",
      isGeneral:!!ruleset&&this.#view==="general",isCollection:!!ruleset&&Boolean(currentKind),isContentFamily:currentKind==="contentTemplate",isDependencies:!!ruleset&&this.#view==="dependencies",isRuntimeLab:!!ruleset&&this.#view==="runtimeLab",isContentTypes,isContentTemplates,isContentLibraries,
      currentTitle,currentKind,currentType,cards:filteredCards,availableTags,activeTagCount:activeTagIds.size,availableCategories,activeCategoryCount:activeCategoryIds.size,dependencyGroups:dependencyVisibleGroups,dependencySelected,dependencyGraph,dependencyStats,dependencyAvailableTags,dependencyActiveTagCount:dependencyActiveTags.size,dependencyUnresolvedOnly,actors,runtimeDefinitions,runtimeActions,runtimeFormulas,runtimeConditions,runtimeTests,runtimeEvents,runtimeResult:this.#runtimeResult,runtimeStateCards,runtimeSelection:this.#runtimeSelection,runtimeActorTypeOptions:availableDocumentTypes("Actor").map(id=>({id,sourceSelected:id===this.#runtimeSelection.sourceType,targetSelected:id===this.#runtimeSelection.targetType})),runtimeTool,runtimeModes,runtimeGuide,selectedActorName,
      publishReadiness:this.#view==='general'&&record?.status==='draft'?this.#publishReadiness(api,ruleset):null,
      lifecycle:record?{isValidated:record.status==="validated",isReady:record.status==="ready",isDraft:record.status==="draft",canMutate:record.status!=="validated",canCreateVersion:record.status==="validated",canDelete:true}:null,
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
    for(const input of this.element?.querySelectorAll?.("[data-runtime-select], [data-runtime-input]")??[])input.addEventListener("change",event=>{const key=event.currentTarget.dataset.runtimeSelect??event.currentTarget.dataset.runtimeInput;this.#runtimeSelection[key]=event.currentTarget.value;if(key==="actorRole"||key==="tool"||key==="source"||key==="target")this.render(false);});
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
      const api=await this.#api(),kind=grid.querySelector("[data-orderable-card]")?.dataset.kind??grid.querySelector("[data-orderable-card]")?.dataset.action;
      const buttons=[...grid.querySelectorAll("[data-orderable-card]")];
      const method={definitionType:"updateDefinitionType",definition:"updateDefinition",contentType:"updateContentType",contentTemplate:"updateContentTemplate",parameter:"updateParameter",formula:"updateFormula",formulaBinding:"updateFormulaBinding",condition:"updateCondition",effect:"updateEffect",action:"updateAction",permissionPolicy:"updatePermissionPolicy",eventType:"updateEventType",trigger:"updateTrigger",tag:"updateTag",reference:"updateReference"}[this.#currentCardKind()];
      if(!method)return;
      for(let i=0;i<buttons.length;i++){const id=buttons[i].dataset.entryId,entry=this.#readCardEntry(api,this.#currentCardKind(),id);const order=(i+1)*10;if(entry&&(entry.order??0)!==order)await api[method](this.#selected,id,{...entry,order});}
      await this.render(false);
    }catch(error){this.#error=error?.message??String(error);await this.render(false);}
  }

  #currentCardKind(){if(this.#view==="definitionTypes")return "definitionType";if(this.#view.startsWith("definitions:"))return "definition";if(this.#view==="contentTypes")return "contentType";if(this.#view.startsWith("content:"))return "contentTemplate";return TOP_LEVEL.find(item=>item.view===this.#view)?.kind??null;}
  #readCardEntry(api,kind,id){const getter={definitionType:"getDefinitionType",definition:"getDefinition",contentType:"getContentType",contentTemplate:"getContentTemplate",parameter:"getParameter",formula:"getFormula",formulaBinding:"getFormulaBinding",condition:"getCondition",effect:"getEffect",action:"getAction",permissionPolicy:"getPermissionPolicy",eventType:"getEventType",trigger:"getTrigger",tag:"getTag",reference:"getReference"}[kind];return getter?api[getter](this.#selected,id):null;}

  #rememberScroll() {
    const area=this.element?.querySelector("[data-main-scroll]");
    if (area) this.#scroll.set(this.#view,{top:area.scrollTop,left:area.scrollLeft});
  }

  async #openEditor(kind,id=null,extra={}) {
    this.entryEditor?.close?.();
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
      if (action==="clearCategoryFilters") {
        this.#categoryFilters.delete(this.#view);
        this.#rememberScroll();this.#restoreScroll=true;
        return this.render(false);
      }
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
      if (action==="selectDependency") {this.#dependencyListScroll=this.element?.querySelector('.rta-dependencies__items')?.scrollTop??0;this.#dependencySelected=button.dataset.dependencyKey;return this.render(false);}
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
      if (action==="publish") { await api.publishRuleset(button.dataset.versionId??this.#selected); return this.render(false); }
      if (action==="validate") { await api.validateRulesetVersion(button.dataset.versionId??this.#selected); return this.render(false); }
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
        const prompt=isActive?"This Ruleset version is active. Deactivate and delete it? This cannot be undone.":"Delete this Ruleset version? This cannot be undone.";
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
        if(typeof game.ruleThemAll.runtimeLab.createTestActors!=="function")throw new Error("Test Actor creation is unavailable.");
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
        this.#runtimeResult={title:"Test Actors ready",message:`${source.name} and ${target.name} are initialized with demo scores (${created} new Definition state(s)). Existing test Actors are reset to the demo profile.`};
        return this.render(false);
      }
      if (action==="runtimeLoad") { const ref=this.#runtimeSelection.target||this.#runtimeSelection.source;if(!ref)throw new Error("Choose an Actor first.");this.#runtimeResult={title:"Runtime state",state:await game.ruleThemAll.runtimeLab.getContainerState(ref,{rulesetVersionId:this.#selected})};return this.render(false);}
      if (action==="runtimeInstantiate") {const ref=this.#runtimeSelection.target||this.#runtimeSelection.source,id=this.#runtimeSelection.definitionId;if(!ref||!id)throw new Error("Choose an Actor and Definition.");const base=Number(this.element.querySelector('[name="runtimeBase"]')?.value??0);await game.ruleThemAll.runtimeLab.instantiateDefinition(this.#selected,ref,id,{initial:{"value.base":base,"state.active":false}});this.#runtimeResult={title:"Definition instantiated",message:"Runtime state updated.",state:await game.ruleThemAll.runtimeLab.getContainerState(ref,{rulesetVersionId:this.#selected})};return this.render(false);}
      if (action==="runtimeInitAll") {
        const refs=[...new Set([this.#runtimeSelection.source,this.#runtimeSelection.target].filter(Boolean))];
        if(!refs.length)throw new Error("Choose at least one Actor first.");
        let created=0,lastState=null;
        for(const ref of refs){const result=await game.ruleThemAll.runtimeLab.initializeContainer(this.#selected,ref);created+=result.created??0;lastState=result.state;}
        this.#runtimeResult={title:"Actors initialized",message:`${created} Definition state(s) instantiated across ${refs.length} Actor(s). Formulae, Conditions and Tests use Source / Self by default; Effects may target Target.`,state:lastState};
        return this.render(false);
      }
      if (action==="runtimeUpdateState") {const ref=this.#runtimeSelection.actorRole==="target"?(this.#runtimeSelection.target||this.#runtimeSelection.source):this.#runtimeSelection.source,id=button.dataset.definitionId;if(!ref||!id)throw new Error("Choose an Actor and runtime value.");const row=button.closest("[data-runtime-state-row]");const options={};const base=row?.querySelector('[name="runtimeStateBase"]');const pools=[...(row?.querySelectorAll('[name="runtimeStatePool"]')??[])];const active=row?.querySelector('[name="runtimeStateActive"]');if(base)options.base=Number(base.value);if(pools.length)options.pools=Object.fromEntries(pools.map(input=>[input.dataset.slotId,Number(input.value)]));if(active)options.active=active.checked;await game.ruleThemAll.runtimeLab.setDefinitionState(this.#selected,ref,id,options);this.#runtimeResult={title:"Actor value saved",message:"Runtime state updated. You can run the next test immediately."};return this.render(false);}
      if (action==="runtimeFormula") {const id=this.#runtimeSelection.formulaId;if(!id)throw new Error("Choose a Formula.");const context=this.#runtimeContext();const value=await game.ruleThemAll.runtimeLab.evaluateFormula(this.#selected,id,context);this.#runtimeResult={title:"Formula result",message:String(value)};return this.render(false);}
      if (action==="runtimeCondition") {const id=this.#runtimeSelection.conditionId;if(!id)throw new Error("Choose a Condition.");const context=this.#runtimeContext();const value=await game.ruleThemAll.runtimeLab.evaluateCondition(this.#selected,id,context);this.#runtimeResult={title:"Condition result",message:value?"TRUE":"FALSE"};return this.render(false);}
      if (action==="runtimePreviewAction"||action==="runtimeExecuteAction") {const id=this.#runtimeSelection.actionId;if(!id)throw new Error("Choose an Action.");const context=this.#runtimeContext();const preview=action==="runtimePreviewAction";const result=preview?await game.ruleThemAll.runtimeLab.previewAction(this.#selected,id,context):await game.ruleThemAll.runtimeLab.executeAction(this.#selected,id,context);this.#runtimeResult={title:preview?"Action preview":"Action executed",message:result.allowed===false?`Blocked by ${result.conditionId}`:`${result.changes?.length??0} change(s).`,changes:result.changes??[]};return this.render(false);}
      if (action==="runtimeTest") {const id=this.#runtimeSelection.testId;if(!id)throw new Error("Choose a Test.");const result=await game.ruleThemAll.runtimeLab.executeTest(this.#selected,id,this.#runtimeContext());this.#runtimeResult={title:"Test resolved",message:`${result.roll.formula}: ${result.roll.total} + ${result.bonus} = ${result.total}${result.target===null?"":` vs ${result.target}`} · ${result.outcome?.nameKey??result.outcome?.resultKey??"No outcome"}`,testResult:result};return this.render(false);}
      if (action==="runtimeRoll") {const formula=String(this.element.querySelector('[name="runtimeRollFormula"]')?.value??this.#runtimeSelection.rollFormula??"");this.#runtimeSelection.rollFormula=formula;const result=await game.ruleThemAll.runtimeLab.roll(formula,{});this.#runtimeResult={title:"Foundry Roll",message:`${result.formula} = ${result.total}`,rollResult:result.result};return this.render(false);}
      if (action==="runtimeEvent") {const id=this.#runtimeSelection.eventTypeId;if(!id)throw new Error("Choose an Event Type.");const result=await game.ruleThemAll.runtimeLab.emitEvent(this.#selected,id,{},this.#runtimeContext());this.#runtimeResult={title:"Event emitted",message:`${result.triggered.length} Trigger(s) fired.`,triggered:result.triggered};return this.render(false);}
      if (action==="export") {
        const id=button.dataset.versionId??this.#selected; const payload=api.exportRuleset(id,{includeWorldLocalizations:true});
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=`rta-ruleset-${id}.json`;a.click();URL.revokeObjectURL(url); return;
      }
    } catch(error) {
      let message=error?.message??String(error);
      if(message.startsWith("Definition is not instantiated on RuntimeContainer:"))message+= " Use ‘Initialize both Actors’ in Runtime Lab, then retry.";
      this.#error=message; return this.render(false);
    }
  }

  #runtimeContext(){const source=this.#runtimeSelection.source,target=this.#runtimeSelection.target||source;return {roles:{self:source,source,target,subject:target,owner:source},defaultRole:"self",userContext:{userId:game.user?.id??null,isGM:Boolean(game.user?.isGM)}};}

  async #import(event) {
    const file=event.currentTarget.files?.[0]; if(!file)return;
    try { const api=await this.#api(); const payload=JSON.parse(await file.text()); await api.importRuleset(payload,"NEW"); await this.render(false); }
    catch(error){ this.#error=error?.message??String(error); await this.render(false); }
  }
}
