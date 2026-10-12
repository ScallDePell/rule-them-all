/* Editor context and collection for the card lists of rule entries
   (Roll variants, ...). Context building is pure; collection reads the cards. */
import {collectCards, choicesFor} from "./card-form.mjs";

const named = (kind, entries, withColors) => entries.map(entry => ({id: entry.id, label: entry.nameKey, ...withColors(kind, entry)}));

/** Roll: one card per variant (a Condition and the dice thrown while it is true). */
export function rollVariantContext(data, {conditions = [], withColors}) {
  const choices = named("condition", conditions, withColors);
  const row = (variant = {}) => ({conditions: choicesFor(choices, variant.conditionRef ?? ""), formula: variant.formula ?? ""});
  return {rollVariants: {rows: (data.variants ?? []).map(row), blank: row()}};
}
export function collectRollVariants(queryAll) {
  return collectCards(queryAll, "rollVariant").map(card => ({conditionRef: card.conditionRef ?? "", formula: card.formula ?? ""}));
}
