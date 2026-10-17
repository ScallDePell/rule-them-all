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
  if (data.blind) Object.assign(data, {content: renderActionChatHTML({title: summary.title, outcome: "???"}), flags: {[MODULE_ID]: {blindCard: content}}});
  return data;
}

function currentRollMode() {
  try { return globalThis.game?.settings?.get?.("core", "rollMode") ?? null; } catch { return null; }
}

/** Post an Action card. chat: the ChatMessage class (or a stand-in with create). */
export async function postActionCard(chat, card) {
  return chat?.create?.(actionMessageData(card, {ChatMessage: chat}));
}

/** The GM reads a blind card in full. */
export function installActionCards({hooks = globalThis.Hooks, game = globalThis.game} = {}) {
  hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.flags?.[MODULE_ID]?.blindCard;
    const body = html?.querySelector?.(".message-content");
    if (card && game?.user?.isGM && body) body.innerHTML = card;
  });
}
