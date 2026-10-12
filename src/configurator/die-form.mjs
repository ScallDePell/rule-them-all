/* Die editor: counter cards (Success, Advantage…) and face cards, each face with a count per counter.
   Context building and collection are pure; syncDieFaceCounts keeps the face cards in step with the
   counter cards while the GM edits, before anything is saved. */
import {collectCards} from "./card-form.mjs";

const COUNTER_ID = /^[a-z][a-z0-9_-]*$/;
const slug = value => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function dieContext(data) {
  const counters = data.counters ?? [];
  const counts = (face = {}) => counters.map(counter => ({key: counter.id, label: counter.labelKey || counter.id, count: face.counts?.[counter.id] ?? ""}));
  const face = (entry = {}) => ({labelKey: entry.labelKey ?? "", value: entry.value ?? "", counts: counts(entry)});
  return {
    dieCounters: {rows: counters.map(counter => ({key: counter.id, id: counter.id, labelKey: counter.labelKey ?? ""})), blank: {key: "", id: "", labelKey: ""}},
    dieFaces: {rows: (data.faces ?? []).map(face), blank: face()}
  };
}

/** {counters, faces} from the cards. A new counter's id comes from its label; a face count left empty is 0. */
export function collectDie(queryAll) {
  const cards = collectCards(queryAll, "dieCounter"), used = new Set(cards.map(card => card.id).filter(Boolean)), idByKey = new Map();
  const fresh = label => {
    let base = slug(label) || "counter";
    if (!COUNTER_ID.test(base)) base = `c-${base}`;
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  const counters = cards.map(card => {
    const id = card.id || fresh(card.labelKey);
    idByKey.set(card.key || id, id);
    return {id, labelKey: card.labelKey ?? ""};
  });
  const faces = collectCards(queryAll, "dieFace").map((card, index) => {
    const value = String(card.value ?? "").trim(), counts = {};
    if (value !== "" && !Number.isFinite(Number(value))) throw new Error(`Face ${index + 1}: the value must be a number.`);
    for (const [prop, text] of Object.entries(card)) {
      if (!prop.startsWith("count:") || String(text).trim() === "") continue;
      const id = idByKey.get(prop.slice(6)), n = Number(text);
      if (!id) continue;
      if (!Number.isSafeInteger(n)) throw new Error(`Face ${index + 1}: a count must be a whole number.`);
      if (n !== 0) counts[id] = n;
    }
    return {labelKey: card.labelKey ?? "", value: value === "" ? null : Number(value), counts};
  });
  return {counters, faces};
}

let nextKey = 1;
/** Give every face card (and the blank face) one count field per counter card, keeping the counts typed so far. */
export function syncDieFaceCounts(root) {
  const counterCards = [...root.querySelectorAll('[data-card="dieCounter"]')];
  const faces = root.querySelector("[data-die-faces]");
  if (!faces) return;
  const unnamed = faces.dataset.unnamed || "?";
  const counters = counterCards.map(card => {
    const keyInput = card.querySelector('[data-card-prop="key"]');
    if (keyInput && !keyInput.value) keyInput.value = `new-${nextKey++}`;
    return {key: keyInput?.value ?? "", label: card.querySelector('[data-card-prop="labelKey"]')?.value.trim() || unnamed};
  });
  const template = root.querySelector('[data-card-template="dieFace"]');
  const boxes = [...root.querySelectorAll("[data-face-counts]"), ...(template ? template.content.querySelectorAll("[data-face-counts]") : [])];
  for (const box of boxes) {
    const doc = box.ownerDocument, typed = new Map([...box.querySelectorAll("[data-face-count]")].map(row => [row.dataset.faceCount, row.querySelector("input")?.value ?? ""]));
    box.replaceChildren(...counters.map(({key, label}) => {
      const row = doc.createElement("div"), caption = doc.createElement("label"), input = doc.createElement("input");
      row.className = "form-group rta-form-row";
      row.dataset.faceCount = key;
      caption.className = "rta-form-row__label";
      caption.textContent = label;
      input.type = "number";
      input.step = "1";
      input.dataset.cardProp = `count:${key}`;
      input.value = typed.get(key) ?? "";
      row.append(caption, input);
      return row;
    }));
  }
}
