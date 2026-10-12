/* The dice of one roll, die by die. A roll result carries `dice`: one entry per dice term, in formula order:
   {group, faces, modifiers[], sign, pooled, value, results: [{value, active, dropped?, rerolled?}]}.
   group: the term's label (2d10[hunger] -> "hunger"), null without one; sign: -1 when the term is subtracted;
   pooled: the term sits inside a group {..}, a parenthesis or a function, so its share of the total is unknown.
   Formulas read these dice (count the 10s, the highest die of a group); a reroll may throw some of them again. */

import {COMPARE} from "../configurator/dice-reading.mjs";

const isDiceTerm = term => term && Number.isFinite(Number(term.faces)) && Array.isArray(term.results);
const describeTerm = (term, sign, pooled) => ({
  group: term.flavor ? String(term.flavor) : null, faces: Number(term.faces), modifiers: [...(term.modifiers ?? [])].map(String), sign, pooled,
  value: Number(term.total ?? 0),
  results: term.results.map(r => ({value: Number(r.result), active: r.active !== false, ...(r.discarded ? {dropped: true} : {}), ...(r.rerolled ? {rerolled: true} : {})}))
});

/** The dice of an evaluated Foundry Roll. Top-level terms keep their sign; dice nested anywhere else are pooled. */
export function foundryDice(roll) {
  const out = [], top = new Set();
  let sign = 1;
  for (const term of roll?.terms ?? []) {
    if (typeof term?.operator === "string") { sign = term.operator === "-" ? -1 : term.operator === "+" ? 1 : 0; continue; }
    if (isDiceTerm(term)) { out.push(describeTerm(term, sign || 1, sign === 0)); top.add(term); }
    sign = 1;
  }
  for (const term of roll?.dice ?? []) if (!top.has(term) && isDiceTerm(term)) out.push(describeTerm(term, 1, true));
  return out;
}

/** A term's share of the total from its results: successes when it counts them (cs, cf), else the sum of its kept dice;
 * keep and drop modifiers choose again among the dice they chose from. */
function termValue(term) {
  const candidates = term.results.filter(r => !r.rerolled);
  for (const modifier of term.modifiers) {
    const match = modifier.match(/^(kh|kl|k|dh|dl)(\d*)$/);
    if (!match) continue;
    const [, kind, n] = match, count = Number(n || 1), sorted = [...candidates].sort((a, b) => a.value - b.value);
    const keep = new Set(kind === "kh" || kind === "k" ? sorted.slice(-count) : kind === "kl" ? sorted.slice(0, count) : kind === "dh" ? sorted.slice(0, -count) : sorted.slice(count));
    for (const r of candidates) { r.active = keep.has(r); if (r.active) delete r.dropped; else r.dropped = true; }
  }
  const counting = term.modifiers.map(m => m.match(/^(cs|cf)(<=|>=|=|<|>)?(\d+)$/)).filter(Boolean);
  const active = term.results.filter(r => r.active);
  if (!counting.length) return active.reduce((sum, r) => sum + r.value, 0);
  const test = (cmp = "=", n, v) => ({"=": v === n, "<": v < n, ">": v > n, "<=": v <= n, ">=": v >= n})[cmp];
  let total = 0;
  for (const r of active) for (const [, kind, cmp, n] of counting) if (test(cmp, Number(n), r.value)) total += kind === "cs" ? 1 : -1;
  return total;
}

/** The same roll with the kept dice that match `filter` ({group, compare, value}) thrown again (next(faces) gives the new value)
 * or set to `replaceWith`; its total follows. Dice inside a group {..} or a function cannot be thrown again on their own. */
export async function rerollSomeDice(roll, {group = null, compare = null, value = null} = {}, {next, replaceWith = null} = {}) {
  const dice = structuredClone(roll?.dice ?? []);
  if (!dice.length) throw new Error("This roll has no dice to throw again.");
  const offset = Number(roll.total) - dice.filter(term => !term.pooled).reduce((sum, term) => sum + term.sign * term.value, 0);
  let changed = 0;
  for (const term of dice) {
    if (group && term.group !== group) continue;
    const hits = term.results.filter(r => r.active && (!compare || COMPARE[compare]?.(r.value, Number(value))));
    if (!hits.length) continue;
    if (term.pooled) throw new Error("Dice inside a group {..} or a function cannot be thrown again on their own.");
    for (const r of hits) { r.value = replaceWith === null ? Number(await next(term.faces)) : Number(replaceWith); changed++; }
    term.value = termValue(term);
  }
  const total = offset + dice.filter(term => !term.pooled).reduce((sum, term) => sum + term.sign * term.value, 0);
  const first = dice[0]?.results.find(r => r.active)?.value ?? null;
  return {...roll, dice, total, natural: first, result: `${roll.result ?? roll.total} → ${total}`, changedDice: changed};
}
