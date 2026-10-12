/* Repeated cards an editor adds and removes (Roll variants, Action inputs, Table rows,
   progression rows). A card is [data-card="<list>"]; its controls carry
   data-card-prop="<name>". A checkbox with data-card-multi adds its value to a list;
   a plain checkbox reads as a boolean. Controls of a card nested in another card
   belong to the inner card only. */

export function readCard(card) {
  const out = {};
  for (const control of card.querySelectorAll("[data-card-prop]")) {
    if (control.closest("[data-card]") !== card) continue;
    const name = control.dataset.cardProp;
    if (control.type === "checkbox" && control.dataset.cardMulti !== undefined) {
      out[name] ??= [];
      if (control.checked) out[name].push(control.value);
    } else if (control.type === "checkbox") out[name] = control.checked;
    else out[name] = String(control.value ?? "").trim();
  }
  return out;
}

/** Cards of one list, in their order on the page. */
export function collectCards(queryAll, list) {
  return [...queryAll(`[data-card="${list}"]`)].map(readCard);
}

/** Choices for a select, the stored id marked selected. */
export function choicesFor(entries, selectedId) {
  return entries.map(entry => ({...entry, selected: entry.id === selectedId}));
}

/** A whole number from a card field; "" gives the fallback. */
export function cardInteger(value, label, fallback = null) {
  const text = String(value ?? "").trim();
  if (text === "") return fallback;
  const number = Number(text);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

/** Show the parts of a card that depend on one of its choices:
 * data-card-when="<prop>:<value> <value>…" is visible only while that prop holds one of the values. */
export function syncCard(card) {
  for (const part of card.querySelectorAll("[data-card-when]")) {
    if (part.closest("[data-card]") !== card) continue;
    const [prop, values = ""] = part.dataset.cardWhen.split(":");
    const control = [...card.querySelectorAll(`[data-card-prop="${prop}"]`)].find(node => node.closest("[data-card]") === card);
    part.toggleAttribute("hidden", !values.split(" ").includes(String(control?.value ?? "")));
  }
}
