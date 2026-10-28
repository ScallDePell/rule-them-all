/** Foundry: the active Ruleset's Event Types bound to a hook (EventType.hook) happen when that hook is called. The
 * hooks listened to follow the Ruleset: they are listed again after every change of the configurator. */
import {hookEvents} from "./hook-events.mjs";

export function installHookEvents({configurator, getRuntime, resolveRuleset, hooks = globalThis.Hooks}) {
  const listening = new Map();
  const fire = name => (...args) => {
    const game = globalThis.game, runtime = getRuntime(), versionId = configurator.getActiveVersionId?.();
    if (!runtime || !versionId) return;
    let ruleset;
    try { ruleset = resolveRuleset(versionId); } catch { return; }
    const speaker = globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game?.user?.character ?? null;
    const targets = [...(game?.user?.targets ?? [])].map(token => token.actor?.uuid).filter(Boolean);
    for (const eventType of ruleset?.eventTypes ?? []) {
      if (eventType.enabled === false || eventType.hook?.name !== name) continue;
      if ((eventType.hook.who ?? "local") === "gm" && !game?.users?.activeGM?.isSelf) continue;
      for (const {payload, context} of hookEvents(eventType, args, {speaker, targets}))
        Promise.resolve(runtime.emitEvent(versionId, eventType.id, payload, context)).catch(error => console.error(`Rule Them'All | Event ${eventType.id} from hook ${name} failed`, error));
    }
  };
  const refresh = () => {
    const versionId = configurator.getActiveVersionId?.();
    let wanted = new Set();
    try { wanted = new Set((resolveRuleset(versionId)?.eventTypes ?? []).filter(type => type.enabled !== false && type.hook?.name).map(type => type.hook.name)); } catch { /* no active Ruleset */ }
    for (const [name, id] of listening) if (!wanted.has(name)) { hooks.off(name, id); listening.delete(name); }
    for (const name of wanted) if (!listening.has(name)) listening.set(name, hooks.on(name, fire(name)));
    return [...listening.keys()];
  };
  return {refresh};
}
