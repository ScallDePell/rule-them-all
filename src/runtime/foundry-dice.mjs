/* A Ruleset's own dice (2dp) as Foundry dice terms. Each Die becomes a DiceTerm subclass under its letter in
   CONFIG.Dice.terms, so Foundry throws it, and under its class name in CONFIG.Dice.termTypes, so a chat message
   rebuilds it. A face rolls its rank; the term's total adds the faces' values; the chat shows the faces' labels. */

import {dieFace} from "./dice-results.mjs";

const classes = new Map();
const className = (rulesetKey, die) => `RuleThemAllDie_${`${rulesetKey}_${die.id}`.replace(/[^A-Za-z0-9_]/g, "_")}`;

/** The DiceTerm class of one Die, made once per Ruleset, Die and faces. */
export function rulesetDieClass(Base, rulesetKey, die) {
  const plain = {id: die.id, denomination: die.denomination, faces: (die.faces ?? []).map(face => ({labelKey: face.labelKey ?? "", value: face.value ?? null, counts: {...(face.counts ?? {})}}))};
  const key = `${className(rulesetKey, die)}|${JSON.stringify(plain)}`;
  if (classes.has(key)) return classes.get(key);
  class RulesetDie extends Base {
    static DENOMINATION = plain.denomination;
    static rtaDie = plain;
    constructor(termData = {}) { super({...termData, faces: plain.faces.length}); }
    get expression() { return `${this._number ?? this.number}d${plain.denomination}${(this.modifiers ?? []).join("")}`; }
    get total() {
      if (this._evaluated === false) return undefined;
      const total = this.results.reduce((sum, r) => !r.active ? sum : sum + (r.count !== undefined ? r.count : dieFace(plain, r.result).value), 0);
      return this.number < 0 ? -total : total;
    }
    getResultLabel(result) {
      const label = plain.faces[result.result - 1]?.labelKey;
      return label ? (globalThis.game?.i18n?.localize?.(label) ?? label) : String(result.result);
    }
  }
  Object.defineProperty(RulesetDie, "name", {value: className(rulesetKey, die)});
  classes.set(key, RulesetDie);
  return RulesetDie;
}

/** Make the enabled dice of a Ruleset the ones Foundry throws for their letters. */
export function registerRulesetDice(rulesetKey, dice = [], {config = globalThis.CONFIG, Base = globalThis.foundry?.dice?.terms?.DiceTerm} = {}) {
  if (!config?.Dice || !Base) return [];
  config.Dice.termTypes ??= {};
  return dice.filter(die => die && die.enabled !== false && die.denomination).map(die => {
    const cls = rulesetDieClass(Base, rulesetKey, die);
    config.Dice.terms[die.denomination] = cls;
    config.Dice.termTypes[cls.name] = cls;
    return cls;
  });
}
