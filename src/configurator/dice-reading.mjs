/* Reading the dice of a roll (dice: see src/runtime/dice-results.mjs), for the "dice" Formula node. */

export const DICE_READS = Object.freeze(["count", "sum", "highest", "lowest", "size", "matches"]);
export const DICE_COMPARATORS = Object.freeze(["eq", "neq", "gt", "gte", "lt", "lte"]);
export const COMPARE = {eq: (a, b) => a === b, neq: (a, b) => a !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b};

/** The kept dice of a roll, or of one of its groups, as numbers. */
export function keptDice(dice, group = null) {
  return (dice ?? []).filter(term => group === null || group === undefined || group === "" || term.group === group).flatMap(term => term.results.filter(r => r.active).map(r => r.value));
}

/** read: count (dice meeting `compare value`, or all of them), sum, highest, lowest, size (how many dice), matches (the largest set of equal dice). */
export function readDice(dice, {read = "count", group = null, compare = null, value = null} = {}) {
  if (!DICE_READS.includes(read)) throw new Error(`Unknown dice reading: ${read}.`);
  let values = keptDice(dice, group);
  if (compare) {
    if (!COMPARE[compare]) throw new Error(`Unknown dice comparison: ${compare}.`);
    const target = Number(value);
    if (!Number.isFinite(target)) throw new Error("A dice comparison needs a number.");
    values = values.filter(v => COMPARE[compare](v, target));
  }
  if (read === "count" || read === "size") return values.length;
  if (read === "sum") return values.reduce((a, b) => a + b, 0);
  if (!values.length) return 0;
  if (read === "highest") return Math.max(...values);
  if (read === "lowest") return Math.min(...values);
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Math.max(...counts.values());
}

