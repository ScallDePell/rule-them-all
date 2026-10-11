import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON,isRecord} from "../configurator/configurator-schema.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {analyzeCreationSystem} from "./creation-plan.mjs";

/** CP-15: a CreationSession keeps a player's creation decisions until the character exists.
 * It can be left and resumed; finalizing builds the character in one go and only then
 * marks the session completed. */
export const CREATION_SESSION_STATUSES=Object.freeze(["draft","completed","abandoned"]);
export const CREATION_SESSION_ERRORS=Object.freeze({conflict:"CREATION_SESSION_CONFLICT",incomplete:"CREATION_SESSION_INCOMPLETE",closed:"CREATION_SESSION_CLOSED",notFound:"CREATION_SESSION_NOT_FOUND"});

const sessionError=(code,message,details={})=>Object.assign(new Error(message),{code,details});
const newId=()=>`creation-${globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** Sessions of each user live in that user's flags: a player may update their own User. */
export class FoundryCreationSessionStore{
  #user(userId){const user=game.users?.get?.(userId);if(!user)throw new Error(`Foundry User not found: ${userId}.`);return user;}
  async list(userId){return Object.values(copyJSON(this.#user(userId).getFlag(MODULE_ID,"creationSessions")??{}));}
  async get(userId,id){return copyJSON(this.#user(userId).getFlag(MODULE_ID,"creationSessions")?.[id]??null);}
  async put(session){await this.#user(session.ownerUserId).update({[`flags.${MODULE_ID}.creationSessions.${session.id}`]:copyJSON(session)});return copyJSON(session);}
}
export class MemoryCreationSessionStore{
  sessions=new Map();
  async list(userId){return [...this.sessions.values()].filter(session=>session.ownerUserId===userId).map(session=>copyJSON(session));}
  async get(userId,id){const session=this.sessions.get(id);return session&&session.ownerUserId===userId?copyJSON(session):null;}
  async put(session){this.sessions.set(session.id,copyJSON(session));return copyJSON(session);}
}

export class CreationSessions{
  /** finalize(session, {name, actorType}) builds the character and returns {actor, run}. */
  constructor({configurator,store,finalize,userId=()=>globalThis.game?.user?.id??null,now=()=>Date.now()}){this.configurator=configurator;this.store=store;this.finalizer=finalize;this.userId=userId;this.now=now;}
  #ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId);}
  async #load(id,{revision=null,draft=true}={}){
    const session=await this.store.get(this.userId(),id);
    if(!session)throw sessionError(CREATION_SESSION_ERRORS.notFound,`Creation session not found: ${id}.`,{id});
    if(revision!==null&&session.revision!==revision)throw sessionError(CREATION_SESSION_ERRORS.conflict,`Creation session changed since it was read (revision ${session.revision}, expected ${revision}).`,{id,expected:revision,actual:session.revision});
    if(draft&&session.status!=="draft")throw sessionError(CREATION_SESSION_ERRORS.closed,`Creation session is ${session.status}.`,{id});
    return session;
  }
  #validate(session){
    const analysis=analyzeCreationSystem(this.#ruleset(session.rulesetVersionId),session.creationSystemId,session.answers);
    session.validationState={complete:analysis.complete,steps:analysis.steps.map(step=>({id:step.id,valid:!step.errors.length,errors:step.errors}))};
    session.selectedRefs=copyJSON(analysis.selectedByStep);
    return analysis;
  }
  async #save(session){session.revision+=1;session.updatedAt=this.now();this.#validate(session);return this.store.put(session);}
  async start(versionId,creationSystemId,{targetContainerKind="character",notes={}}={}){
    const system=(this.#ruleset(versionId).creationSystems??[]).find(entry=>entry.id===creationSystemId&&entry.enabled!==false);
    if(!system)throw new Error(`Creation System unavailable: ${creationSystemId}.`);
    const at=this.now(),session={id:newId(),creationSystemId,rulesetVersionId:versionId,targetContainerKind,ownerUserId:this.userId(),status:"draft",currentStepId:system.steps?.[0]?.id??null,
      answers:{},selectedRefs:{},allocations:{},rolls:{},notes:copyJSON(notes),revision:0,createdAt:at,updatedAt:at,validationState:null,result:null};
    return this.#save(session);
  }
  list(){return this.store.list(this.userId());}
  /** Record one step's answer and move to the next step. Other answers are kept as they are. */
  async answer(id,stepId,answer,{revision=null}={}){
    const session=await this.#load(id,{revision});
    const steps=this.#steps(session);if(!steps.some(step=>step.id===stepId))throw new Error(`Unknown Creation System step: ${stepId}.`);
    if(!(Array.isArray(answer)||isRecord(answer)))throw new TypeError("A creation answer is a list of ids or an object.");
    session.answers[stepId]=copyJSON(answer);
    const index=steps.findIndex(step=>step.id===stepId);session.currentStepId=steps[index+1]?.id??stepId;
    return this.#save(session);
  }
  async goTo(id,stepId,{revision=null}={}){
    const session=await this.#load(id,{revision});
    if(!this.#steps(session).some(step=>step.id===stepId))throw new Error(`Unknown Creation System step: ${stepId}.`);
    session.currentStepId=stepId;return this.#save(session);
  }
  async abandon(id,{revision=null}={}){const session=await this.#load(id,{revision});session.status="abandoned";return this.#save(session);}
  /** CreationContext: the session with each step's state, recomputed from the current Ruleset. */
  async context(id){
    const session=await this.#load(id,{draft:false}),analysis=this.#validate(session),byId=new Map(analysis.steps.map(step=>[step.id,step]));
    return {session,complete:analysis.complete,steps:this.#steps(session).map(step=>({...copyJSON(step),answer:copyJSON(session.answers[step.id]??null),current:step.id===session.currentStepId,valid:!byId.get(step.id)?.errors.length,errors:byId.get(step.id)?.errors??[]})),
      preview:analysis.complete?{operations:copyJSON(analysis.operations),initialByDefinition:copyJSON(analysis.initialByDefinition)}:null};
  }
  /** Build the character; the session becomes completed only after that succeeded. */
  async finalize(id,{name,actorType=null,revision=null}={}){
    const session=await this.#load(id,{revision});
    if(!this.#validate(session).complete)throw sessionError(CREATION_SESSION_ERRORS.incomplete,"Creation session has invalid or missing answers.",{id,steps:session.validationState.steps.filter(step=>!step.valid)});
    const {actor,run}=await this.finalizer(session,{name,actorType});
    const done=await this.#load(id,{revision:session.revision});
    done.status="completed";done.result={actorUuid:actor?.uuid??null,completedAt:run?.completedAt??this.now()};
    return {session:await this.#save(done),actor,run};
  }
  #steps(session){return (this.#ruleset(session.rulesetVersionId).creationSystems??[]).find(entry=>entry.id===session.creationSystemId)?.steps??[];}
}
