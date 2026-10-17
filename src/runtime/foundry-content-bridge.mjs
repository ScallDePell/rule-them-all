import {resolveDocumentType,descriptionPath as findDescriptionPath} from "../core/system-document-types.mjs";
import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON} from "../configurator/configurator-schema.mjs";
import {acquiredActionIds} from "./content-access.mjs";
import {resolveAcquisitionChoices} from "./acquisition-choices.mjs";
import {planCreationSystem} from "./creation-plan.mjs";
import {initialForDefinition} from "./content-binding.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {ContentGrantHandlers,listAcquisitionReferences} from "./content-relations.mjs";
import {promptAcquisitionChoices} from "./guided-acquisition.mjs";
import {foundryJSON} from "./foundry-data.mjs";
import {moduleLanguage} from "../core/module-language.mjs";


const TEMPLATE_FLAG="contentTemplate";
const ACQUISITIONS_FLAG="contentAcquisitions";
const DEFINITION_ORIGINS_FLAG="contentDefinitionOrigins";
const originKey=(versionId,definitionId)=>JSON.stringify([versionId,definitionId]);
const slug=value=>String(value??"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"content";
const clone=value=>copyJSON(value);

export function packNameFor(versionId,contentType){
  const v=slug(String(versionId??"").replace(/^version-/,"" )).slice(0,12)||"version";
  return `rta-${v}-${slug(contentType?.id??contentType?.nameKey)}`.slice(0,80);
}

export function templateFlags(versionId,template,contentType){
  return {
    managed:true,
    versionId:String(versionId),
    templateId:String(template.id),
    contentTypeId:String(contentType.id),
    runtimeMode:template.runtimeMode??contentType.runtimeMode??"unique",
    relations:clone(template.relations??[]),
    choiceGroups:clone(template.choiceGroups??[]),
    capabilities:clone(template.capabilities??[]),
    tags:clone(template.tags??[]),
    data:clone(template.data??{})
  };
}

export class FoundryContentBridge{
  #actorMutations=new Map();
  async #withActorMutation(actorRef,work){
    const key=String(actorRef);
    const previous=this.#actorMutations.get(key)??Promise.resolve();
    const pending=previous.catch(()=>{}).then(work);
    this.#actorMutations.set(key,pending);
    try{return await pending;}finally{if(this.#actorMutations.get(key)===pending)this.#actorMutations.delete(key);}
  }
  constructor(configurator,runtime,{hooks=globalThis.Hooks,documentTypeResolver=resolveDocumentType,descriptionPath=findDescriptionPath,grantHandlers=new ContentGrantHandlers()}={}){this.configurator=configurator;this.runtime=runtime;this.hooks=hooks;this.documentTypeResolver=documentTypeResolver;this.descriptionPath=descriptionPath;this.grantHandlers=grantHandlers;}
  ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId);}
  label(versionId,key){try{return this.configurator.resolveLocalizedText(versionId,moduleLanguage(),key,k=>globalThis.game?.i18n?.localize?.(k)??k);}catch{return key;}}
  #documentSpec(contentType){
    if(contentType.storageKind==="actor")return {documentName:"Actor",type:this.documentTypeResolver("Actor",{requestedType:contentType.documentSubtype??null}),klass:globalThis.Actor};
    return {documentName:"Item",type:this.documentTypeResolver("Item",{requestedType:contentType.documentSubtype??null}),klass:globalThis.Item};
  }
  #compendiumClass(){return globalThis.CompendiumCollection??globalThis.foundry?.documents?.collections?.CompendiumCollection;}
  async ensurePack(versionId,contentType){
    if(!globalThis.game?.user?.isGM)throw new Error("Only a GM can create or synchronize Rule Them'All Compendiums.");
    const spec=this.#documentSpec(contentType),name=packNameFor(versionId,contentType),id=`world.${name}`;
    let pack=globalThis.game?.packs?.get?.(id);
    if(pack){if(pack.documentName!==spec.documentName)throw new Error(`Compendium ${id} contains ${pack.documentName}, expected ${spec.documentName}.`);return pack;}
    const Compendium=this.#compendiumClass();if(!Compendium?.createCompendium)throw new Error("Foundry Compendium creation API is unavailable.");
    pack=await Compendium.createCompendium({label:`Rule Them'All · ${this.label(versionId,contentType.nameKey)}`,name,type:spec.documentName,system:globalThis.game?.system?.id});
    return pack;
  }
  documentData(versionId,template,contentType){
    const spec=this.#documentSpec(contentType);
    const data={name:this.label(versionId,template.nameKey),type:spec.type,img:template.image||contentType.image||undefined,flags:{[MODULE_ID]:{[TEMPLATE_FLAG]:templateFlags(versionId,template,contentType)}}};
    // The template's description becomes the document's own, where the Game System has one.
    const path=template.descriptionKey?this.descriptionPath(spec.documentName,spec.type):null;
    if(path){const keys=path.split("."),last=keys.pop();keys.reduce((node,key)=>node[key]??={},data)[last]=this.label(versionId,template.descriptionKey);}
    return data;
  }
  /** Execute only Creation steps whose effects are defined by the generic
   * Runtime contract. The full plan is validated before Actor.create().
   * Failure deletes ONLY the newly created Actor; an existing Actor is never
   * silently mutated or rolled back by this method.
   * actorUuid: build onto an Actor that already exists (a new character made from the Actors directory), instead of
   * creating one. That Actor must hold no Content yet; its runtime values are replaced by the creation's.
   */
  async createActorFromCreationSystem(versionId,creationSystemId,{name,actorType=null,answers={},sessionId=null,actorUuid=null}={}){
    if(typeof name!=="string"||!name.trim())throw new Error("Creating an Actor requires a name.");
    // A CreationSession finalized again after an interruption gets the Actor it completed,
    // or replaces the Actor it left half built.
    const existing=sessionId&&!actorUuid?globalThis.game?.actors?.find?.(actor=>actor.getFlag?.(MODULE_ID,"creationSessionId")===sessionId):null;
    if(existing?.getFlag(MODULE_ID,"creationRun"))return {actor:existing,run:foundryJSON(existing.getFlag(MODULE_ID,"creationRun"))};
    if(existing)await existing.delete();
    const ruleset=this.ruleset(versionId);
    const plan=await planCreationSystem(ruleset,creationSystemId,answers);
    let actor;
    if(actorUuid){
      actor=await this.runtime.adapter.resolveDocument(actorUuid);
      if(actor?.documentName!=="Actor")throw new Error("Character creation needs an Actor.");
      if(actor.getFlag?.(MODULE_ID,"creationRun"))throw new Error(`${actor.name} was already created.`);
      if(Object.keys(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{}).length)throw new Error(`${actor.name} already holds Contents: create the character on a new Actor.`);
      if(this.runtime.adapter.canWrite&&!await this.runtime.adapter.canWrite(actor.uuid))throw new Error("Actor is not writable by the current user.");
      // The values given when the Actor started without creation make way for the creation's.
      await this.runtime.resetContainer(actor.uuid);
      if(actor.name!==name.trim()&&typeof actor.update==="function")await actor.update({name:name.trim(),...(sessionId?{[`flags.${MODULE_ID}.creationSessionId`]:sessionId}:{})});
      else if(sessionId)await actor.setFlag(MODULE_ID,"creationSessionId",sessionId);
    }else{
      const type=this.documentTypeResolver("Actor",{requestedType:actorType});
      const klass=globalThis.Actor?.implementation??globalThis.Actor;
      if(!klass?.create)throw new Error("Foundry Actor.create API is unavailable.");
      actor=await klass.create({name:name.trim(),type,...(sessionId?{flags:{[MODULE_ID]:{creationSessionId:sessionId}}}:{})});
      if(!actor?.uuid||actor.documentName!=="Actor")throw new Error("Foundry did not return a created Actor.");
    }
    try{
      return await this.runtime.duringCreation(actor.uuid,()=>this.#buildCreation(versionId,creationSystemId,{actor,plan,ruleset,sessionId}));
    }catch(error){
      if(actorUuid)throw error;
      try{await actor.delete();}catch(rollbackError){
        throw new AggregateError([error,rollbackError],"Creation failed and the new Actor could not be removed.");
      }
      throw error;
    }
  }
  /** The steps' choices written on the Actor: chosen Definitions, Contents, then allocated points. */
  async #buildCreation(versionId,creationSystemId,{actor,plan,ruleset,sessionId}){
    const created=new Set(),acquisitions=[];
    // Every Definition chosen in the steps is instantiated in one runtime transaction.
    const chosen=[...new Set(plan.operations.filter(operation=>operation.kind==="definition").map(operation=>operation.definitionId))];
    if(chosen.length){const result=await this.runtime.acquire(versionId,actor.uuid,{definitionBindings:chosen.map(definitionId=>({definitionId,initial:plan.initialByDefinition[definitionId]??{}})),summary:{creationSystemId}});for(const id of result.acquiredDefinitionIds)created.add(id);}
    for(const operation of plan.operations.filter(operation=>operation.kind==="content")){
      // A Content kept as an Item becomes a real Item of the Actor, as if it had been dropped on its sheet.
      const type=(ruleset.contentTypes??[]).find(entry=>entry.id===(ruleset.contentTemplates??[]).find(template=>template.id===operation.templateId)?.contentTypeId);
      const asItem=typeof actor.createEmbeddedDocuments==="function"&&type&&type.storageKind!=="actor";
      const result=asItem
        ?(await this.createOwnedContentItem(versionId,actor.uuid,operation.templateId,{selections:operation.selections??{}})).acquisition
        :await this.acquireTemplate(versionId,actor.uuid,operation.templateId,{
          sourceItemId:`creation:${creationSystemId}:${operation.stepId}:${operation.templateId}`,
          selections:operation.selections
        });
      for(const id of result.createdDefinitionIds??[])created.add(id);
      acquisitions.push({templateId:operation.templateId,stepId:operation.stepId,alreadyApplied:result.alreadyApplied===true});
    }
    // Allocated points come last: they add to what the Contents granted.
    for(const operation of plan.operations.filter(operation=>operation.kind==="allocation")){
      const result=await this.runtime.acquire(versionId,actor.uuid,{definitionBindings:Object.entries(operation.allocations).map(([definitionId,points])=>({definitionId,initial:{},add:{"value.base":points}})),summary:{creationSystemId,stepId:operation.stepId}});
      for(const id of result.acquiredDefinitionIds)created.add(id);
    }
    const run={versionId,creationSystemId,sessionId,selectedByStep:plan.selectedByStep,createdDefinitionIds:[...created],acquisitions,completedAt:Date.now()};
    await actor.setFlag(MODULE_ID,"creationRun",run);
    this.hooks?.callAll?.("ruleThemAllCreationCompleted",actor,clone(run));
    return {actor,run:clone(run)};
  }
  async syncContentType(versionId,contentTypeId){
    const ruleset=this.ruleset(versionId),contentType=(ruleset.contentTypes??[]).find(x=>x.id===contentTypeId&&x.enabled!==false);if(!contentType)throw new Error(`Content Type unavailable: ${contentTypeId}.`);
    const templates=(ruleset.contentTemplates??[]).filter(x=>x.enabled!==false&&x.contentTypeId===contentTypeId),pack=await this.ensurePack(versionId,contentType),spec=this.#documentSpec(contentType);
    const wasLocked=Boolean(pack.locked);if(wasLocked&&pack.configure)await pack.configure({locked:false});
    try{
      const docs=await pack.getDocuments(),byTemplate=new Map();
      for(const doc of docs){const flag=doc.getFlag?.(MODULE_ID,TEMPLATE_FLAG);if(flag?.managed&&flag.versionId===versionId&&flag.contentTypeId===contentTypeId)byTemplate.set(flag.templateId,doc);}
      let created=0,updated=0,deleted=0;
      for(const template of templates){const data=this.documentData(versionId,template,contentType),existing=byTemplate.get(template.id);if(existing){await existing.update(data);updated++;byTemplate.delete(template.id);}else{const klass=spec.klass?.implementation??spec.klass;if(!klass?.create)throw new Error(`${spec.documentName} creation API is unavailable.`);await klass.create(data,{pack:pack.collection});created++;}}
      for(const stale of byTemplate.values()){await stale.delete();deleted++;}
      return {packId:pack.collection,label:pack.title??pack.metadata?.label??contentType.nameKey,contentTypeId,created,updated,deleted,total:templates.length};
    }finally{if(wasLocked&&pack.configure)await pack.configure({locked:true});}
  }
  async syncAll(versionId){
    const ruleset=this.ruleset(versionId),results=[];
    for(const type of ruleset.contentTypes??[])if(type.enabled!==false)results.push(await this.syncContentType(versionId,type.id));
    this.hooks?.callAll?.("ruleThemAllContentLibrariesSynchronized",{versionId,results:clone(results)});return results;
  }
  getAcquisitionTemplate(versionId,templateId){
    const ruleset=this.ruleset(versionId);
    const template=(ruleset.contentTemplates??[]).find(x=>x.id===templateId&&x.enabled!==false);
    if(!template)throw new Error(`Content Template unavailable: ${templateId}.`);
    return template;
  }
  assertAcquisitionEligibility(actor,versionId,templateId){
    const ruleset=this.ruleset(versionId),template=this.getAcquisitionTemplate(versionId,templateId);
    const type=(ruleset.contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);
    if(!type)throw new Error(`Content Type unavailable: ${template.contentTypeId}.`);
    if((template.runtimeMode??type.runtimeMode)==='unique'){
      const acquisitions=actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{};
      if(Object.values(acquisitions).some(a=>a?.versionId===versionId&&a?.templateId===templateId))
        throw new Error(`This Actor already has the unique Content Template: ${templateId}.`);
    }
    return {template,contentType:type};
  }
  /** Pure preflight: the same reference, operation and initial-state checks
   * protect the native preCreate hook, the guided dialog and Runtime writes. */
  preflightAcquisition(versionId,templateId,selections={}){
    const ruleset=this.ruleset(versionId),template=this.getAcquisitionTemplate(versionId,templateId);
    const contentType=(ruleset.contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);
    if(!contentType)throw new Error(`Content Type unavailable: ${template.contentTypeId}.`);
    const selected=resolveAcquisitionChoices(template,selections);
    const selectedRelations=selected.map(option=>({
      id:`${option.groupId}:${option.id}`,operation:option.operation,targetRef:option.targetRef,config:option.config??{}
    }));
    const plan=this.grantHandlers.prepare(ruleset,[...(template.relations??[]),...selectedRelations]);
    // A definition can be granted more than once, but conflicting configured
    // initial states may never be silently resolved by input ordering.
    const bindings=new Map();
    for(const binding of plan.definitionBindings){
      const id=binding?.definitionId;if(!id)continue;
      const explicit=binding.initial??{};
      const initial=Object.keys(explicit).length?explicit:initialForDefinition(template,id);
      if(!initial||typeof initial!=='object'||Array.isArray(initial))throw new Error(`Invalid initial Definition state: ${id}.`);
      const previous=bindings.get(id);
      const keys=Object.keys(initial).sort(),oldKeys=Object.keys(previous?.initial??{}).sort();
      if(previous&&keys.length&&oldKeys.length&&JSON.stringify(initial)!==JSON.stringify(previous.initial))
        throw new Error(`Conflicting initial Definition states: ${id}.`);
      // config.add values sum up, whichever grant brings them (a +1 from a Parcours and one from a background).
      const add={...(previous?.add??{})};for(const [key,value] of Object.entries(binding.add??{}))add[key]=Number(add[key]??0)+Number(value);
      if(!previous||(!oldKeys.length&&keys.length))bindings.set(id,{...binding,initial,add});else previous.add=add;
    }
    const definitionBindings=[...bindings.values()];
    const grantedDefinitionIds=[...bindings.keys()];
    const actionIds=[...new Set(plan.actionIds.filter(Boolean))];
    if(Array.isArray(ruleset.definitions))for(const id of grantedDefinitionIds)
      if(!ruleset.definitions.some(d=>d.id===id&&d.enabled!==false))throw new Error(`Acquisition Definition unavailable: ${id}.`);
    if(Array.isArray(ruleset.actions))for(const id of actionIds)
      if(!ruleset.actions.some(a=>a.id===id&&a.enabled!==false))throw new Error(`Acquisition Action unavailable: ${id}.`);
    for(const grant of plan.contentGrants)if(!(ruleset.contentTemplates??[]).some(t=>t.id===grant.templateId&&t.enabled!==false))throw new Error(`Granted Content Template unavailable: ${grant.templateId}.`);
    return {selected,plan,definitionBindings,grantedDefinitionIds,actionIds,contentGrants:plan.contentGrants};
  }
  /** Guided Item creation. All choices and reference semantics are validated
   * before the first Foundry document write. A failure removes only the new
   * Item, never an existing Actor or unrelated Inventory entry.
   */
  async createOwnedContentItem(versionId,actorRef,templateId,{selections=null,prompt=promptAcquisitionChoices,sourceData=null,depth=0}={}){
    const made=await this.#createOwnedContentItem(versionId,actorRef,templateId,{selections,prompt,sourceData});
    if(made)await this.#grantContents(versionId,made.acquisition,{prompt,depth});
    return made;
  }
  /** The Contents an acquisition grants, made as owned Items of the same Actor once its own write lock is released.
   * A unique Content the Actor already holds is skipped; grants nest a few levels at most. */
  async #grantContents(versionId,acquisition,{prompt=promptAcquisitionChoices,depth=0}={}){
    if(!acquisition||acquisition.alreadyApplied||!(acquisition.contentGrants??[]).length)return;
    if(depth>=4)throw new Error(`Content grants nest too deeply under ${acquisition.templateId}.`);
    const ruleset=this.ruleset(versionId),actor=await this.runtime.adapter.resolveDocument(acquisition.actorRef);
    for(const grant of acquisition.contentGrants){
      const template=this.getAcquisitionTemplate(versionId,grant.templateId),type=(ruleset.contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);
      if(!type||type.storageKind==='actor')throw new Error(`Content ${acquisition.templateId} grants ${grant.templateId}, which is not an Item Content.`);
      for(let copy=0;copy<grant.count;copy++){
        try{this.assertAcquisitionEligibility(actor,versionId,grant.templateId);}catch{break;}
        const made=await this.createOwnedContentItem(versionId,actor.uuid,grant.templateId,{selections:grant.selections??{},prompt,depth:depth+1});
        for(const [fieldId,value] of Object.entries(grant.fields??{}))if(made?.item?.id)await this.runtime.setContentField(versionId,actor.uuid,made.item.id,fieldId,value);
      }
    }
  }
  async #createOwnedContentItem(versionId,actorRef,templateId,{selections,prompt,sourceData}){
    const ruleset=this.ruleset(versionId),template=this.getAcquisitionTemplate(versionId,templateId);
    const contentType=(ruleset.contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);
    if(!contentType)throw new Error(`Content Type unavailable: ${template.contentTypeId}.`);
    if(contentType.storageKind==='actor')throw new Error('Actor-backed Content cannot be embedded as an Item.');
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor?.documentName!=='Actor'||!actor.createEmbeddedDocuments)throw new Error('An editable Foundry Actor is required.');
    this.assertAcquisitionEligibility(actor,versionId,templateId);
    if(this.runtime.adapter.canWrite&&!await this.runtime.adapter.canWrite(actorRef))throw new Error('Actor is not writable by the current user.');
    let answers=selections;
    if(answers===null){answers=(template.choiceGroups??[]).length?await prompt(ruleset,template):{};}
    if(answers===null)return null; // The player cancelled: no Item exists.
    this.preflightAcquisition(versionId,templateId,answers);
    return this.#withActorMutation(actor.uuid,async()=>{
    // A second acquisition may have completed while the dialog was open.
    // Re-check inside the Actor's write lock before creating an Item.
    this.assertAcquisitionEligibility(actor,versionId,templateId);
    const canonical=this.documentData(versionId,template,contentType);
    // A native Foundry drag can carry independent Item fields and third-party
    // flags. Preserve the instance transparently, while refreshing ONLY RTA's
    // provenance against the actual Ruleset and checked selections.
    const data=sourceData?foundryJSON(sourceData):canonical;
    if(sourceData){
      if(data.type!==canonical.type)throw new Error(`Content Item subtype changed: expected ${canonical.type}.`);
      delete data._id;delete data.id;
      data.flags={...(data.flags??{}),[MODULE_ID]:{
        ...(data.flags?.[MODULE_ID]??{}),[TEMPLATE_FLAG]:canonical.flags[MODULE_ID][TEMPLATE_FLAG]
      }};
    }
    data.flags[MODULE_ID][TEMPLATE_FLAG].acquisitionSelections=clone(answers);
    const created=await actor.createEmbeddedDocuments('Item',[data]);
    const item=created?.[0];
    if(!item?.id)throw new Error('Foundry did not create the acquired Item.');
    try{
      const acquisition=await this.#acquireTemplateUnlocked(versionId,actor.uuid,templateId,{sourceItemId:item.id,selections:answers});
      return {item,acquisition};
    }catch(error){
      try{await item.delete();}catch(rollbackError){
        throw new AggregateError([error,rollbackError],'Acquisition failed and the new Item could not be removed.');
      }
      throw error;
    }
    });
  }
  /** Move an Actor onto another version of its Ruleset (its own deleted or replaced): the runtime state first
   * (rebindContainer), then the flags that name the version (acquisitions, origins, creation run, held Items).
   * The Contents it holds give the Definitions the new version adds to them (a new status granted by the Socle). */
  async rebindActor(versionId,actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);if(actor.documentName!=="Actor")throw new Error("Only an Actor can change its Ruleset version.");
    const result=await this.runtime.rebindContainer(versionId,actor.uuid),ruleset=this.ruleset(versionId);
    const templates=new Set((ruleset.contentTemplates??[]).filter(x=>x.enabled!==false).map(x=>x.id));
    const acquisitions=foundryJSON(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{}),origins={};
    for(const [key,acquisition] of Object.entries(acquisitions)){
      if(!templates.has(acquisition?.templateId)){delete acquisitions[key];continue;}
      acquisition.versionId=versionId;for(const id of acquisition.createdDefinitionIds??[])origins[originKey(versionId,id)]=true;
    }
    const held=(await this.runtime.getContainerState(actor.uuid)).definitionStates??{},missing=new Map();
    for(const acquisition of Object.values(acquisitions)){
      let plan;try{plan=this.preflightAcquisition(versionId,acquisition.templateId,acquisition.selections??{});}catch{continue;}
      const template=this.getAcquisitionTemplate(versionId,acquisition.templateId);
      for(const binding of plan.definitionBindings??[])if(binding?.definitionId&&!held[binding.definitionId]&&!missing.has(binding.definitionId))
        missing.set(binding.definitionId,{definitionId:binding.definitionId,initial:binding.initial??initialForDefinition(template,binding.definitionId),add:binding.add??{}});
    }
    if(missing.size){const granted=await this.runtime.acquire(versionId,actor.uuid,{definitionBindings:[...missing.values()],summary:{rebind:result.from}});result.granted=granted.acquiredDefinitionIds??[...missing.keys()];}
    await actor.setFlag(MODULE_ID,ACQUISITIONS_FLAG,acquisitions);await actor.setFlag(MODULE_ID,DEFINITION_ORIGINS_FLAG,origins);
    const run=foundryJSON(actor.getFlag?.(MODULE_ID,"creationRun")??null);if(run?.versionId&&run.versionId!==versionId)await actor.setFlag(MODULE_ID,"creationRun",{...run,versionId});
    for(const item of actor.items??[]){const flag=foundryJSON(item.getFlag?.(MODULE_ID,TEMPLATE_FLAG)??null);if(flag?.versionId&&flag.versionId!==versionId&&templates.has(flag.templateId))await item.setFlag(MODULE_ID,TEMPLATE_FLAG,{...flag,versionId});}
    return result;
  }
  async acquireTemplate(versionId,actorRef,templateId,options={}){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    const acquisition=await this.#withActorMutation(actor.uuid,()=>this.#acquireTemplateUnlocked(versionId,actor.uuid,templateId,options));
    if(typeof actor.createEmbeddedDocuments==='function')await this.#grantContents(versionId,acquisition);
    return acquisition;
  }
  /** An Actor made from an Actor Content (a creature dragged from its compendium) takes on its template: the
   * Definitions with their values, the Actions and the Contents it grants. Done once; returns null otherwise. */
  async applyActorTemplate(actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);if(actor?.documentName!=="Actor")return null;
    const flag=foundryJSON(actor.getFlag?.(MODULE_ID,TEMPLATE_FLAG)??null);if(!flag?.managed||!flag.versionId||!flag.templateId)return null;
    let template;try{template=this.getAcquisitionTemplate(flag.versionId,flag.templateId);}catch{return null;}
    const type=(this.ruleset(flag.versionId).contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);if(type?.storageKind!=="actor")return null;
    const acquisitions=actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{};
    if(Object.values(acquisitions).some(a=>a?.versionId===flag.versionId&&a?.templateId===flag.templateId))return null;
    return this.acquireTemplate(flag.versionId,actor.uuid,flag.templateId,{selections:flag.acquisitionSelections??{}});
  }
  async #acquireTemplateUnlocked(versionId,actorRef,templateId,{sourceItemId=null,selections={}}={}){
    const ruleset=this.ruleset(versionId),template=(ruleset.contentTemplates??[]).find(x=>x.id===templateId&&x.enabled!==false);if(!template)throw new Error(`Content Template unavailable: ${templateId}.`);
    const contentType=(ruleset.contentTypes??[]).find(x=>x.id===template.contentTypeId&&x.enabled!==false);if(!contentType)throw new Error(`Content Type unavailable: ${template.contentTypeId}.`);
    const actor=await this.runtime.adapter.resolveDocument(actorRef);if(actor.documentName!=="Actor")throw new Error("Content can only be acquired by an Actor RuntimeContainer.");
    const current=foundryJSON(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{}),key=sourceItemId??`manual:${template.id}`;
    if(current[key])return {...clone(current[key]),alreadyApplied:true};
    if((template.runtimeMode??contentType.runtimeMode)==="unique"){
      const duplicate=Object.values(current).find(a=>a?.templateId===template.id&&a?.versionId===versionId);
      if(duplicate)return {...clone(duplicate),alreadyApplied:true,duplicate:true};
    }
    // The same preflight is used by the dialog, preCreateItem and Runtime.
    const {selected:selectedOptions,plan:relationPlan,definitionBindings,grantedDefinitionIds,actionIds,contentGrants}=
      this.preflightAcquisition(versionId,templateId,selections);
    if(this.runtime.adapter.canWrite&&!await this.runtime.adapter.canWrite(actorRef))throw new Error("Actor is not writable by the current user.");
    const previousAcquisitions=clone(current);
    const previousOrigins=foundryJSON(actor.getFlag?.(MODULE_ID,DEFINITION_ORIGINS_FLAG)??{});
    const origins=clone(previousOrigins);
    for(const acquisition of Object.values(current))for(const id of acquisition?.createdDefinitionIds??[])origins[originKey(acquisition.versionId,id)]=true;
    // CP-16: the Content's grants and its acquisition Action (Conditions, Costs, Effects) are one transaction.
    const bindings=definitionBindings.filter(binding=>binding?.definitionId).map(binding=>({definitionId:binding.definitionId,initial:binding.initial??initialForDefinition(template,binding.definitionId),add:binding.add??{}}));
    const runtimeResult=await this.runtime.acquire(versionId,actor.uuid,{actionId:template.acquisitionActionRef??null,definitionBindings:bindings,content:{key,templateId:template.id,contentTypeId:template.contentTypeId},summary:{templateId:template.id,sourceItemId}});
    if(!runtimeResult.allowed)throw new Error(`Acquisition refused by Action ${template.acquisitionActionRef}: ${runtimeResult.reason}.`);
    const createdDefinitionIds=[...runtimeResult.acquiredDefinitionIds];
    let writtenOrigins=false,writtenAcquisitions=false;
    try{
      for(const id of createdDefinitionIds)origins[originKey(versionId,id)]=true;
      const acquisition={templateId:template.id,contentTypeId:template.contentTypeId,versionId,sourceItemId,createdDefinitionIds,grantedDefinitionIds,actionIds,contentGrants,actorRef:actor.uuid,linkedRefs:relationPlan.linkedRefs,unlockedRefs:relationPlan.unlockedRefs,grantedRefs:relationPlan.grantedRefs,selections:clone(selections),selectedOptions,transactionId:runtimeResult.transactionId,appliedAt:Date.now()};
      current[key]=acquisition;
      await actor.setFlag(MODULE_ID,DEFINITION_ORIGINS_FLAG,origins);writtenOrigins=true;
      await actor.setFlag(MODULE_ID,ACQUISITIONS_FLAG,current);writtenAcquisitions=true;
      this.hooks?.callAll?.("ruleThemAllContentAcquired",actor,clone(acquisition));
      return clone(acquisition);
    }catch(error){
      const rollbackFailures=[];
      if(writtenAcquisitions)try{await actor.setFlag(MODULE_ID,ACQUISITIONS_FLAG,previousAcquisitions);}catch(failure){rollbackFailures.push(failure);}
      if(writtenOrigins)try{await actor.setFlag(MODULE_ID,DEFINITION_ORIGINS_FLAG,previousOrigins);}catch(failure){rollbackFailures.push(failure);}
      // The runtime transaction is corrected by compensating entries, never by rewriting the ledger.
      for(const entryId of [...(runtimeResult.ledgerEntryIds??[])].reverse()){
        try{await this.runtime.compensate(versionId,actor.uuid,entryId);}catch(failure){rollbackFailures.push(failure);}
      }
      if(rollbackFailures.length)throw new AggregateError([error,...rollbackFailures],"Acquisition failed and rollback was incomplete.");
      throw error;
    }
  }
  /** Execute an Action granted by an acquired Content Template. Internal
   * system triggers intentionally remain separate from this Actor-facing API.
   */
  async executeAcquiredAction(versionId,actorRef,actionId,context={},options={}){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Acquired Actions require an Actor.");
    if(!(await this.runtime.adapter.canWrite(actorRef)))throw new Error("Actor is not writable by the current user.");
    const ruleset=this.ruleset(versionId);
    if(!(ruleset.actions??[]).some(action=>action.id===actionId&&action.enabled!==false))
      throw new Error(`Action unavailable: ${actionId}.`);
    const records=actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{},grants=acquiredActionIds(records,versionId);
    if(!grants.includes(actionId))throw new Error(`Action not acquired by Actor: ${actionId}.`);
    // options.contentKey: the owned Content the Action is used from (its fields feed contentField Formulas).
    const contentKey=options.contentKey??null;
    if(contentKey&&!(records[contentKey]?.versionId===versionId&&(records[contentKey].actionIds??[]).includes(actionId)))throw new Error(`Action ${actionId} is not granted by Content ${contentKey}.`);
    // The grant's owner is always the initiating Actor: callers cannot
    // substitute a different self/source while reusing another Actor's grant.
    const safeContext={...context,roles:{...(context.roles??{}),self:actor.uuid,source:actor.uuid},...(contentKey?{content:{key:contentKey,role:"self"}}:{})};
    if(contentKey&&!(await this.runtime.listOwnedContents(versionId,actor.uuid,safeContext)).find(row=>row.key===contentKey)?.available)throw new Error(`Content ${contentKey} is not available.`);
    const {contentKey:_contentKey,...actionOptions}=options;
    return this.runtime.executeAction(versionId,actionId,safeContext,actionOptions);
  }
  async listGrantedReferences(versionId,actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Granted references require an Actor.");
    return listAcquisitionReferences(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG),versionId,'grantedRefs');
  }
  async hasGrantedReference(versionId,actorRef,targetRef){
    if(!targetRef?.objectKind||!targetRef?.objectId)throw new Error('Grant lookup requires a typed target reference.');
    const granted=await this.listGrantedReferences(versionId,actorRef);
    return granted.some(ref=>ref.objectKind===targetRef.objectKind&&ref.objectId===targetRef.objectId);
  }
  async listUnlockedReferences(versionId,actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Unlocked references require an Actor.");
    return listAcquisitionReferences(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG),versionId,'unlockedRefs');
  }
  async listLinkedReferences(versionId,actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Linked references require an Actor.");
    return listAcquisitionReferences(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG),versionId,'linkedRefs');
  }
  async listAcquiredActions(versionId,actorRef){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Acquired Actions require an Actor.");
    const allowed=new Set((this.ruleset(versionId).actions??[]).filter(a=>a.enabled!==false).map(a=>a.id));
    return acquiredActionIds(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG),versionId).filter(id=>allowed.has(id));
  }
  async releaseAcquisition(actorRef,acquisitionKey){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    return this.#withActorMutation(actor.uuid,()=>this.#releaseAcquisitionUnlocked(actor.uuid,acquisitionKey));
  }
  async #releaseAcquisitionUnlocked(actorRef,acquisitionKey){
    const actor=await this.runtime.adapter.resolveDocument(actorRef);
    if(actor.documentName!=="Actor")throw new Error("Content acquisitions require an Actor.");
    const previous=foundryJSON(actor.getFlag?.(MODULE_ID,ACQUISITIONS_FLAG)??{}),acquisition=previous[acquisitionKey];
    if(!acquisition)return null;
    const current=clone(previous);delete current[acquisitionKey];
    const origins=foundryJSON(actor.getFlag?.(MODULE_ID,DEFINITION_ORIGINS_FLAG)??{});
    // Existing 0.1.57 records had createdDefinitionIds but no separate provenance flag.
    for(const recorded of Object.values(previous))for(const id of recorded?.createdDefinitionIds??[])origins[originKey(recorded.versionId,id)]=true;
    const stillGranted=new Set(Object.values(current).flatMap(record=>(record?.grantedDefinitionIds??record?.createdDefinitionIds??[]).map(id=>originKey(record.versionId,id))));
    const ownIds=acquisition.grantedDefinitionIds??acquisition.createdDefinitionIds??[];
    for(const definitionId of ownIds){
      const identity=originKey(acquisition.versionId,definitionId);
      if(stillGranted.has(identity)||!origins[identity])continue;
      await this.runtime.removeDefinitionState(acquisition.versionId,actor.uuid,definitionId);
      delete origins[identity];
    }
    await this.runtime.releaseContent?.(acquisition.versionId,actor.uuid,acquisitionKey);
    await actor.setFlag(MODULE_ID,DEFINITION_ORIGINS_FLAG,origins);
    await actor.setFlag(MODULE_ID,ACQUISITIONS_FLAG,current);
    this.hooks?.callAll?.("ruleThemAllContentReleased",actor,clone(acquisition));
    return clone(acquisition);
  }
  async releaseOwnedItem(item){
    const actor=item?.parent;if(actor?.documentName!=="Actor")return null;
    const flag=item.getFlag?.(MODULE_ID,TEMPLATE_FLAG);if(!flag?.managed)return null;
    return this.releaseAcquisition(actor.uuid,item.id);
  }
  async handleOwnedItemCreated(item){
    const actor=item?.parent;if(actor?.documentName!=="Actor")return null;const flag=item.getFlag?.(MODULE_ID,TEMPLATE_FLAG);if(!flag?.managed)return null;
    return this.acquireTemplate(flag.versionId,actor.uuid,flag.templateId,{sourceItemId:item.id,selections:flag.acquisitionSelections??{}});
  }
}
