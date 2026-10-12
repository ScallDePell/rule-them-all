import {MODULE_ID} from "../core/module-contract.mjs";
import {copyJSON,isRecord} from "../configurator/configurator-schema.mjs";
import {foundryJSON} from "./foundry-data.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";
import {analyzeCreationSystem,drawCreationStep,creationBlockOf} from "./creation-plan.mjs";

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
  async list(userId){return Object.values(foundryJSON(this.#user(userId).getFlag(MODULE_ID,"creationSessions")??{}));}
  async get(userId,id){return foundryJSON(this.#user(userId).getFlag(MODULE_ID,"creationSessions")?.[id]??null);}
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
  /** random: [0, 1) source (Foundry's CONFIG.Dice.randomUniform); roll(formula): {total, result}, a Foundry Roll by default. */
  constructor({configurator,store,finalize,userId=()=>globalThis.game?.user?.id??null,now=()=>Date.now(),random=()=>globalThis.CONFIG?.Dice?.randomUniform?.()??Math.random(),roll=async formula=>{const result=await new globalThis.Roll(formula).evaluate();return {total:result.total,result:result.result};}}){this.configurator=configurator;this.store=store;this.finalizer=finalize;this.userId=userId;this.now=now;this.random=random;this.roll=roll;}
  #ruleset(versionId){return resolveRuntimeRuleset(this.configurator,versionId);}
  async #load(id,{revision=null,draft=true}={}){
    const session=await this.store.get(this.userId(),id);
    if(!session)throw sessionError(CREATION_SESSION_ERRORS.notFound,`Creation session not found: ${id}.`,{id});
    if(revision!==null&&session.revision!==revision)throw sessionError(CREATION_SESSION_ERRORS.conflict,`Creation session changed since it was read (revision ${session.revision}, expected ${revision}).`,{id,expected:revision,actual:session.revision});
    if(draft&&session.status!=="draft")throw sessionError(CREATION_SESSION_ERRORS.closed,`Creation session is ${session.status}.`,{id});
    return session;
  }
  async #validate(session){
    const analysis=await analyzeCreationSystem(this.#ruleset(session.rulesetVersionId),session.creationSystemId,session.answers);
    session.validationState={complete:analysis.complete,steps:analysis.steps.map(step=>({id:step.id,valid:!step.errors.length,errors:step.errors}))};
    session.selectedRefs=copyJSON(analysis.selectedByStep);
    return analysis;
  }
  async #save(session){session.revision+=1;session.updatedAt=this.now();await this.#validate(session);return this.store.put(session);}
  /** actorUuid: the Actor the character is built onto (one made from the Actors directory); none creates a new Actor. */
  async start(versionId,creationSystemId,{targetContainerKind="character",notes={},actorUuid=null}={}){
    const system=(this.#ruleset(versionId).creationSystems??[]).find(entry=>entry.id===creationSystemId&&entry.enabled!==false);
    if(!system)throw new Error(`Creation System unavailable: ${creationSystemId}.`);
    const at=this.now(),session={id:newId(),creationSystemId,rulesetVersionId:versionId,targetContainerKind,ownerUserId:this.userId(),status:"draft",currentStepId:system.steps?.[0]?.id??null,
      currentTerm:0,answers:{},selectedRefs:{},allocations:{},rolls:{},notes:copyJSON(notes),revision:0,createdAt:at,updatedAt:at,validationState:null,result:null,...(actorUuid?{targetActorUuid:String(actorUuid)}:{})};
    return this.#save(session);
  }
  list(){return this.store.list(this.userId());}
  /** Record one step's answer and move to the next step. Other answers are kept as they are.
   * term: which term of a repeated step (from 0; the session's current term by default). */
  async answer(id,stepId,answer,{revision=null,term=null}={}){
    const session=await this.#load(id,{revision});
    const steps=this.#steps(session);if(!steps.some(step=>step.id===stepId))throw new Error(`Unknown Creation System step: ${stepId}.`);
    if(!(Array.isArray(answer)||isRecord(answer)))throw new TypeError("A creation answer is a list of ids or an object.");
    const at=this.#term(session,steps,stepId,term);
    if(this.#locked(session,steps.find(step=>step.id===stepId),at))throw new Error(`Creation step ${stepId} was drawn and cannot be changed.`);
    this.#put(session,stepId,at,copyJSON(answer),null);
    this.#advance(session,steps,stepId);
    return this.#save(session);
  }
  /** Start another term of the repeated block that `stepId` belongs to: back to its first step. Whether the
   * term is allowed (its maximum, its continue Condition) is checked with the answers, on the block's steps. */
  async nextTerm(id,stepId,{revision=null}={}){
    const session=await this.#load(id,{revision}),steps=this.#steps(session),block=creationBlockOf(steps,stepId);
    if(!block)throw new Error(`Creation step ${stepId} is not repeated.`);
    session.currentTerm=Math.max(0,...steps.slice(block.start,block.end+1).map(step=>(session.answers[step.id]?.terms??[]).length));
    session.currentStepId=steps[block.start].id;
    return this.#save(session);
  }
  /** The term an answer goes to: none outside a repeated block. */
  #term(session,steps,stepId,term){return creationBlockOf(steps,stepId)?Number(term??session.currentTerm??0):null;}
  #put(session,stepId,term,answer,rolls){
    if(term===null){session.answers[stepId]=answer;if(rolls)session.rolls[stepId]=rolls;else delete session.rolls[stepId];return;}
    const terms=[...(session.answers[stepId]?.terms??[])];while(terms.length<term)terms.push(null);terms[term]=answer;session.answers[stepId]={terms};
    const kept=[...(session.rolls[stepId]?.terms??[])];while(kept.length<term)kept.push(null);kept[term]=rolls;session.rolls[stepId]={terms:kept};
  }
  /** Next step; the last step of a block goes on after the block, and another term starts with nextTerm. */
  #advance(session,steps,stepId){const index=steps.findIndex(step=>step.id===stepId);session.currentStepId=steps[index+1]?.id??stepId;}
  /** Draw a step at random (its draw settings); the answer is marked drawn and its dice kept under session.rolls. */
  async draw(id,stepId,{revision=null,term=null}={}){
    const session=await this.#load(id,{revision}),steps=this.#steps(session),step=steps.find(entry=>entry.id===stepId);
    if(!step)throw new Error(`Unknown Creation System step: ${stepId}.`);
    const at=this.#term(session,steps,stepId,term);
    if(this.#locked(session,step,at))throw new Error(`Creation step ${stepId} was already drawn.`);
    const {answer,rolls}=await drawCreationStep(this.#ruleset(session.rulesetVersionId),session.creationSystemId,session.answers,stepId,{random:this.random,roll:this.roll});
    this.#put(session,stepId,at,answer,rolls);
    this.#advance(session,steps,stepId);
    return this.#save(session);
  }
  /** A roll step is thrown once; a drawn step marked locked keeps its draw. */
  #locked(session,step,term=null){const answer=term===null?session.answers[step?.id]:session.answers[step?.id]?.terms?.[term];return (step?.kind==="roll"||step?.draw?.locked===true)&&answer?.drawn===true;}
  async goTo(id,stepId,{revision=null}={}){
    const session=await this.#load(id,{revision});
    if(!this.#steps(session).some(step=>step.id===stepId))throw new Error(`Unknown Creation System step: ${stepId}.`);
    session.currentStepId=stepId;return this.#save(session);
  }
  async abandon(id,{revision=null}={}){const session=await this.#load(id,{revision});session.status="abandoned";return this.#save(session);}
  /** CreationContext: the session with each step's state, recomputed from the current Ruleset: its answer, errors,
   * whether its Condition skips it, its bounds (min, max), the options left by the earlier answers, and whether
   * it is repeated by terms (repeated, endsBlock). */
  async context(id){
    const session=await this.#load(id,{draft:false}),analysis=await this.#validate(session),byId=new Map(analysis.steps.map(step=>[step.id,step]));
    return {session,complete:analysis.complete,steps:this.#steps(session).map(step=>({...copyJSON(step),answer:copyJSON(session.answers[step.id]??null),current:step.id===session.currentStepId,valid:!byId.get(step.id)?.errors.length,errors:byId.get(step.id)?.errors??[],skipped:byId.get(step.id)?.skipped===true,
      bounds:copyJSON(analysis.bounds[step.id]??null),options:copyJSON(analysis.options[step.id]??null),...this.#blockOf(session,step.id)})),
      preview:analysis.complete?{operations:copyJSON(analysis.operations),initialByDefinition:copyJSON(analysis.initialByDefinition)}:null};
  }
  /** Build the character; the session becomes completed only after that succeeded. */
  async finalize(id,{name,actorType=null,revision=null}={}){
    const session=await this.#load(id,{revision});
    if(!(await this.#validate(session)).complete)throw sessionError(CREATION_SESSION_ERRORS.incomplete,"Creation session has invalid or missing answers.",{id,steps:session.validationState.steps.filter(step=>!step.valid)});
    const {actor,run}=await this.finalizer(session,{name,actorType});
    const done=await this.#load(id,{revision:session.revision});
    done.status="completed";done.result={actorUuid:actor?.uuid??null,completedAt:run?.completedAt??this.now()};
    return {session:await this.#save(done),actor,run};
  }
  /** repeated: the step belongs to a block played term after term; endsBlock: it is the block's last step. */
  #blockOf(session,stepId){const steps=this.#steps(session),block=creationBlockOf(steps,stepId);return {repeated:Boolean(block),endsBlock:Boolean(block)&&steps[block.end]?.id===stepId};}
  #steps(session){return (this.#ruleset(session.rulesetVersionId).creationSystems??[]).find(entry=>entry.id===session.creationSystemId)?.steps??[];}
}
