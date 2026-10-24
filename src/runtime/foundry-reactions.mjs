/* Reactions in play: a Trigger in "offer" mode (hook ruleThemAllReactionOffered) asks the player of the reacting
   Actor, on their own client, whether to use one of its Actions. The offer is raised where the event happened
   (often the GM client); it travels on the module socket to the user who answers it. A socket message does not say
   who sent it, so a forged offer is possible, but it only opens a dialog: the Action picked runs on the player's own
   client with their own permissions, as if they had used it from their sheet. */
import {postActionCard} from "./foundry-chat.mjs";
import {MODULE_ID, RUNTIME_HOOKS} from "../core/module-contract.mjs";
import {escapeHTML} from "../ui/html-utils.mjs";
import {actionSummary, translator} from "./foundry-sheets.mjs";
import {resolveRuntimeRuleset} from "./runtime-contracts.mjs";

export const REACTION_MESSAGE = "reactionOffer";
const OWNER = 3;
const listOf = users => typeof users?.values === "function" ? [...users.values()] : [...(users ?? [])];

/** Who answers for an Actor: its active player (the one whose character it is first), else the active GM. */
export function reactingUser(actor, users, activeGM = null) {
  const owners = listOf(users).filter(user => user.active && !user.isGM && Number(actor?.getUserLevel?.(user) ?? actor?.ownership?.[user.id] ?? 0) >= OWNER);
  return owners.find(user => user.character?.id === actor?.id) ?? owners[0] ?? activeGM ?? null;
}

/** Ask the player and run the Action picked: a reroll Action replays the use that caused the event. */
export async function answerReaction(offer, {runtime, ask, chat = null, ruleset, t, speaker = null}) {
  const actions = offer.actionIds.map(id => ruleset.actions?.find(action => action.id === id)).filter(Boolean);
  if (!actions.length) return null;
  const picked = await ask({offer, actions: actions.map(action => ({id: action.id, label: t(action.nameKey ?? action.id)})), eventLabel: t(ruleset.eventTypes?.find(type => type.id === offer.eventTypeId)?.nameKey ?? "")});
  const action = actions.find(entry => entry.id === picked);
  if (!action) return null;
  const result = action.reroll && offer.cause ? await runtime.rerollAction(offer.rulesetVersionId, action.id, offer.cause, offer.context) : await runtime.executeAction(offer.rulesetVersionId, action.id, offer.context);
  if (result?.allowed !== false) await postActionCard(chat, {speaker, summary: actionSummary(result, {t, ruleset}), result});
  return result;
}

/** The reaction dialog: one button per Action, and one to let it pass. Returns the Action id, or null. */
async function askReaction({offer: _offer, actions, eventLabel}, {name}) {
  const Dialog = globalThis.foundry.applications.api.DialogV2, i18n = globalThis.game.i18n;
  const content = `<p>${escapeHTML(i18n.format("RTA.Reaction.Offer", {name}))}${eventLabel ? ` <strong>${escapeHTML(eventLabel)}</strong>` : ""}</p>`;
  const picked = await Dialog.wait({window: {title: i18n.localize("RTA.Reaction.Title")}, content, rejectClose: false,
    buttons: [...actions.map(action => ({action: action.id, label: action.label})), {action: "pass", label: i18n.localize("RTA.Reaction.Pass"), default: true}]});
  return picked && picked !== "pass" ? picked : null;
}

/** Listen for offers (hook) and for offers sent to this user (socket). */
export function installReactions({hooks = globalThis.Hooks, socket = globalThis.game?.socket, game = globalThis.game, channel = `module.${MODULE_ID}`} = {}) {
  const answer = async offer => {
    try {
      const rta = game.ruleThemAll; await rta?.configuratorReady;
      const actor = offer.actor?.uuid ? globalThis.fromUuidSync?.(offer.actor.uuid) : null;
      const ruleset = resolveRuntimeRuleset(rta.configurator, offer.rulesetVersionId);
      const t = translator(offer.rulesetVersionId);
      await answerReaction(offer, {runtime: rta.runtime, ruleset, t, chat: globalThis.ChatMessage, speaker: globalThis.ChatMessage?.getSpeaker?.({actor}),
        ask: request => askReaction(request, {name: actor?.name ?? ""})});
    } catch (error) { console.error("Rule Them'All | Reaction", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); }
  };
  hooks.on(RUNTIME_HOOKS.reactionOffered, offer => {
    const actor = offer?.actor?.uuid ? globalThis.fromUuidSync?.(offer.actor.uuid) : null;
    const user = reactingUser(actor, game.users, game.users?.activeGM);
    if (!user) return;
    if (user.id === game.user?.id) return answer(offer);
    socket?.emit?.(channel, {type: REACTION_MESSAGE, to: user.id, offer});
  });
  socket?.on?.(channel, message => { if (message?.type === REACTION_MESSAGE && message.to === game.user?.id) answer(message.offer); });
}
