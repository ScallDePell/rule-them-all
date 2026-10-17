import {MODULE_ID} from "../core/module-contract.mjs";
import {renderActionChatHTML} from "../ui/sheet-markup.mjs";

/* The chat card of an Action used in play: its Foundry Rolls go with it, so the dice tooltip, Dice So Nice and the
   player's roll mode (public, GM, blind, self) apply as for any Foundry roll. */

/** The Foundry Rolls an Action result threw, in order (the adapter adds foundryRoll; a kept or partly rethrown roll has none). */
export function resultRolls(result) {
  return (result?.use?.dice ?? []).map(entry => entry?.roll?.foundryRoll).filter(Boolean);
}

/** The ChatMessage data of a card: summary {title, lines, outcome}, speaker, the result's Rolls and the roll mode
 * chosen in the chat box. A blind roll shows the players only the title; the GM's chat shows the whole card. */
export function actionMessageData({summary, speaker = null, result = null}, {RollClass = globalThis.Roll ?? globalThis.foundry?.dice?.Roll, ChatMessage = globalThis.ChatMessage, rollMode = currentRollMode(), sound = globalThis.CONFIG?.sounds?.dice} = {}) {
  const content = renderActionChatHTML(summary);
  const data = {content, ...(speaker ? {speaker} : {})};
  const rolls = RollClass?.fromData ? resultRolls(result).flatMap(json => { try { return [RollClass.fromData(json)]; } catch { return []; } }) : [];
  if (rolls.length) Object.assign(data, {rolls, ...(sound ? {sound} : {})});
  if (rollMode && typeof ChatMessage?.applyRollMode === "function") ChatMessage.applyRollMode(data, rollMode);
  // The card's buttons run their Action later, from what the first one did (see RuntimeEngine.runChatAction).
  const flags = result?.chatOffer ? {chatOffer: result.chatOffer} : {};
  if (data.blind) { flags.blindCard = content; data.content = renderActionChatHTML({title: summary.title, outcome: "???"}); }
  if (Object.keys(flags).length) data.flags = {[MODULE_ID]: flags};
  return data;
}

function currentRollMode() {
  try { return globalThis.game?.settings?.get?.("core", "rollMode") ?? null; } catch { return null; }
}

/** Post an Action card. chat: the ChatMessage class (or a stand-in with create). */
export async function postActionCard(chat, card) {
  return chat?.create?.(actionMessageData(card, {ChatMessage: chat}));
}

const owns = (game, ref) => {
  if (game?.user?.isGM) return true;
  const document = ref?.uuid ? globalThis.fromUuidSync?.(ref.uuid) : null;
  return Boolean(document?.isOwner);
};

/** The targets a chat button may answer for, for this user: all of them for the GM, else the ones the user owns. */
export function answeringTargets(offer, game) {
  const roles = offer?.context?.roles ?? {}, targets = [roles.target, ...(offer?.context?.targets ?? [])].filter(Boolean);
  const unique = [...new Map(targets.map(ref => [ref.uuid ?? `${ref.kind}:${ref.id}`, ref])).values()];
  return unique.filter(ref => owns(game, ref));
}

/** May this user press the button? who: gm (the GM), self (the player of the first Action's user), target (a target's owner). */
export function mayPress(offer, who, game) {
  if (who === "gm") return Boolean(game?.user?.isGM);
  if (who === "target") return answeringTargets(offer, game).length > 0;
  return owns(game, offer?.context?.roles?.self);
}

/** Blind cards read in full by the GM; the buttons a user may press, each running its Action and posting its card.
 * summarize(result, versionId) gives a card's summary (actionSummary with the Ruleset's translator). */
export function installActionCards({hooks = globalThis.Hooks, game = globalThis.game, chat = globalThis.ChatMessage, summarize} = {}) {
  hooks.on("renderChatMessageHTML", (message, html) => {
    const flags = message?.flags?.[MODULE_ID] ?? {}, body = html?.querySelector?.(".message-content");
    if (flags.blindCard && game?.user?.isGM && body) body.innerHTML = flags.blindCard;
    const offer = flags.chatOffer;
    if (!offer) return;
    for (const button of html.querySelectorAll?.("[data-rta-chat-action]") ?? []) {
      button.hidden = !mayPress(offer, button.dataset.who, game);
      button.addEventListener("click", async event => {
        event.preventDefault();
        button.disabled = true;
        try {
          const runtime = game.ruleThemAll?.runtime, index = Number(button.dataset.rtaChatAction);
          const runs = button.dataset.who === "target" ? answeringTargets(offer, game).map(as => ({as})) : [{}];
          for (const options of runs) {
            const result = await runtime.runChatAction(offer.rulesetVersionId, offer, index, options);
            if (!result?.allowed) throw new Error(result?.reason ?? "Not allowed.");
            const actor = (options.as ?? offer.context?.roles?.self)?.uuid;
            await postActionCard(chat, {speaker: chat?.getSpeaker?.({actor: actor ? globalThis.fromUuidSync?.(actor) : null}), summary: summarize(result, offer.rulesetVersionId), result});
          }
        } catch (error) { console.error("Rule Them'All | Chat button", error); globalThis.ui?.notifications?.error?.(error?.message ?? String(error)); }
        finally { button.disabled = false; }
      });
    }
  });
}
