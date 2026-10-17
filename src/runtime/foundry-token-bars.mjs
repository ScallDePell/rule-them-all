/* Token bars in Foundry: a token's bar may show a Ruleset pool or bounded value (attribute rta.…, see token-bars.mjs).
   Foundry reads bars synchronously, so each Actor's values are computed by the runtime, kept here and redrawn when
   its runtime data changes. They are read-only on the token: the sheet or an Action changes them. */
import {MODULE_ID} from "../core/module-contract.mjs";
import {TOKEN_BAR_PREFIX} from "./token-bars.mjs";
import {translator} from "./foundry-sheets.mjs";

const isRulesetBar = attribute => typeof attribute === "string" && attribute.startsWith(TOKEN_BAR_PREFIX);

export function installTokenBars({TokenDocumentClass = globalThis.CONFIG?.Token?.documentClass, hooks = globalThis.Hooks, game = globalThis.game} = {}) {
  if (!TokenDocumentClass) return;
  const values = new Map(), pending = new Set();
  const runtime = () => game.ruleThemAll?.runtime;
  const versionId = () => game.ruleThemAll?.configurator?.getActiveVersionId?.() ?? null;
  const tokensOf = actor => actor?.getActiveTokens?.(false, false) ?? [];
  const barsOf = token => [token.document?.bar1?.attribute, token.document?.bar2?.attribute].filter(isRulesetBar);

  async function refresh(actor) {
    const version = versionId(), api = runtime();
    if (!actor?.uuid || !version || !api || pending.has(actor.uuid)) return;
    const tokens = tokensOf(actor), attributes = [...new Set(tokens.flatMap(barsOf))];
    if (!attributes.length) return;
    pending.add(actor.uuid);
    try {
      const shown = new Map();
      for (const attribute of attributes) shown.set(attribute, await api.tokenBarValue(version, {uuid: actor.uuid}, attribute));
      values.set(actor.uuid, shown);
    } catch (error) { console.error("Rule Them'All | Token bars", error); }
    finally { pending.delete(actor.uuid); }
    for (const token of tokens) token.renderFlags?.set?.({refreshBars: true}) ?? token.drawBars?.();
  }

  const getBarAttribute = TokenDocumentClass.prototype.getBarAttribute;
  TokenDocumentClass.prototype.getBarAttribute = function (barName, options = {}) {
    const attribute = options.alternative || this[barName]?.attribute;
    if (!isRulesetBar(attribute)) return getBarAttribute.call(this, barName, options);
    const actor = this.actor, shown = actor ? values.get(actor.uuid) : null;
    if (!shown?.has(attribute)) { if (actor) refresh(actor); return null; }
    const bar = shown.get(attribute);
    return bar ? {type: "bar", attribute, value: bar.value, max: bar.max, editable: false} : null;
  };

  // The token configuration offers the Ruleset's bars, under their names.
  const getTrackedAttributes = TokenDocumentClass.getTrackedAttributes;
  if (typeof getTrackedAttributes === "function") TokenDocumentClass.getTrackedAttributes = function (data, path = []) {
    const tracked = getTrackedAttributes.call(this, data, path);
    if (path.length || !tracked?.bar) return tracked;
    for (const bar of runtime()?.tokenBarAttributes?.(versionId()) ?? []) tracked.bar.push(bar.attribute.split("."));
    return tracked;
  };
  const getTrackedAttributeChoices = TokenDocumentClass.getTrackedAttributeChoices;
  if (typeof getTrackedAttributeChoices === "function") TokenDocumentClass.getTrackedAttributeChoices = function (...args) {
    const choices = getTrackedAttributeChoices.apply(this, args), version = versionId();
    if (!Array.isArray(choices) || !version) return choices;
    const t = translator(version), bars = new Map((runtime()?.tokenBarAttributes?.(version) ?? []).map(bar => [bar.attribute, bar]));
    return choices.map(choice => {
      const bar = bars.get(choice?.value);
      if (!bar) return choice;
      const name = t(bar.nameKey), slot = bar.slotName && bar.slotName !== name ? ` (${t(bar.slotName)})` : "";
      return {...choice, label: `${name}${slot}`, group: "Rule Them'All"};
    });
  };

  hooks.on("updateActor", (actor, change) => { if (change?.flags?.[MODULE_ID]) refresh(actor); });
  hooks.on("updateToken", (token, change) => { if (change?.bar1 || change?.bar2 || change?.delta) refresh(token.actor); });
  const refreshCanvas = canvas => { for (const token of canvas?.tokens?.placeables ?? []) if (barsOf(token).length) refresh(token.actor); };
  hooks.on("canvasReady", refreshCanvas);
  // The scene was drawn before the runtime was ready.
  refreshCanvas(globalThis.canvas);
  return {refresh, values};
}
