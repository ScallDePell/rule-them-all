/** Foundry: the active GM client keeps one Active Effect per active state Definition that has systemChanges on each
 * Actor, so the game system's own data (dnd5e's Strength) follows the module's states. The effects are rebuilt from
 * the states every time an Actor's module data changes: removing the state (or undoing it) removes its effect. */
import {MODULE_ID} from "../core/module-contract.mjs";

const FLAG = "systemChanges";
const LEGACY_MODES = {add: "ADD", multiply: "MULTIPLY", override: "OVERRIDE", upgrade: "UPGRADE", downgrade: "DOWNGRADE"};

/** The effect data Foundry stores: v14 keeps changes in system.changes ({key, type, value}); an older schema with a
 * top-level changes field takes numeric modes. */
export function activeEffectData(effect, {schemaFields = null, modes = globalThis.CONST?.ACTIVE_EFFECT_MODES ?? {}} = {}) {
  const legacy = Boolean(schemaFields?.changes);
  const changes = legacy ? effect.changes.map(({key, type, value}) => ({key, mode: modes[LEGACY_MODES[type]] ?? 2, value})) : effect.changes;
  return {name: effect.name, img: "icons/svg/aura.svg", ...(legacy ? {changes} : {system: {changes}}),
    flags: {[MODULE_ID]: {[FLAG]: {definitionId: effect.definitionId, signature: effect.signature}}}};
}

/** What to do on one Actor: the managed effects [{id, definitionId, signature}] against the wanted ones. */
export function systemEffectPlan(existing, wanted) {
  const keep = new Set(), remove = [];
  for (const effect of existing) {
    const match = wanted.find(entry => entry.definitionId === effect.definitionId && entry.signature === effect.signature);
    if (match && !keep.has(match.definitionId)) keep.add(match.definitionId); else remove.push(effect.id);
  }
  return {remove, create: wanted.filter(entry => !keep.has(entry.definitionId))};
}

/** Active GM: bring one Actor's managed effects in step with its states. getRuntime: the gameplay runtime. */
export async function syncSystemEffects(actor, runtime) {
  if (!actor?.uuid || typeof actor.createEmbeddedDocuments !== "function") return;
  const wanted = await runtime.systemChanges(actor.uuid);
  const existing = [...(actor.effects ?? [])].flatMap(effect => {
    const mark = effect.flags?.[MODULE_ID]?.[FLAG];
    return mark ? [{id: effect.id, definitionId: mark.definitionId, signature: mark.signature}] : [];
  });
  const {remove, create} = systemEffectPlan(existing, wanted);
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove);
  const schemaFields = globalThis.foundry?.documents?.BaseActiveEffect?.schema?.fields ?? null;
  if (create.length) await actor.createEmbeddedDocuments("ActiveEffect", create.map(effect => activeEffectData(effect, {schemaFields})));
}

const hasModuleData = actor => Boolean(actor?.flags?.[MODULE_ID]);

/** Installs the GM watch: after an Actor's module data changes, and for every Actor once the module is ready. */
export function installSystemChanges(getRuntime, {hooks = globalThis.Hooks, delay = 150} = {}) {
  const queue = new Map();
  let timer = null, running = false;
  const run = async () => {
    const game = globalThis.game, runtime = getRuntime();
    if (running || !runtime || !game?.users?.activeGM?.isSelf) return;
    running = true;
    try {
      while (queue.size) {
        const [uuid, actor] = queue.entries().next().value;
        queue.delete(uuid);
        try { await syncSystemEffects(actor, runtime); }
        catch (error) { console.error(`Rule Them'All | System changes of ${actor.name ?? uuid} failed`, error); }
      }
    } finally { running = false; }
    if (queue.size) later();
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(run, delay); };
  const watch = actor => { if (actor?.uuid) { queue.set(actor.uuid, actor); later(); } };
  hooks.on("updateActor", (actor, changes) => { if (changes?.flags?.[MODULE_ID] !== undefined) watch(actor); });
  // An unlinked token's Actor changes through its delta.
  hooks.on("updateActorDelta", (delta, changes) => { if (changes?.flags?.[MODULE_ID] !== undefined) watch(delta.parent?.actor); });
  hooks.on("createActor", actor => { if (hasModuleData(actor)) watch(actor); });
  hooks.once("ruleThemAllReady", () => {
    const game = globalThis.game;
    for (const actor of game?.actors ?? []) if (hasModuleData(actor)) watch(actor);
    for (const scene of game?.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink && hasModuleData(token.actor)) watch(token.actor);
  });
  return run;
}
