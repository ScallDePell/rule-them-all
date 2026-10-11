/** Ordered reference lists: their order comes from drag and drop (§46).
 * Markup: a [data-ordered-list] holding a <select data-ordered-add> and one
 * [data-ordered-item="<id>"] row per candidate; rows not in the list are hidden.
 * Adding shows a row at the end, removing hides it, dragging reorders the shown rows. */

const shown = list => [...list.querySelectorAll("[data-ordered-item]")].filter(row => !row.hidden);

const orderedIds = list => shown(list).map(row => row.dataset.orderedItem);

function sync(list) {
  const select = list.querySelector("[data-ordered-add]"), ids = new Set(orderedIds(list));
  for (const option of select?.options ?? []) if (option.value) option.disabled = ids.has(option.value);
  list.querySelector("[data-ordered-empty]")?.toggleAttribute("hidden", ids.size > 0);
  if (select) { select.value = ""; select.dispatchEvent(new Event("change", {bubbles: true})); }
}

export function wireOrderedLists(root, {onChange = () => {}} = {}) {
  for (const list of root.querySelectorAll("[data-ordered-list]")) {
    const items = list.querySelector("[data-ordered-items]");
    list.querySelector("[data-ordered-add]")?.addEventListener("change", event => {
      const row = event.target.value && items.querySelector(`[data-ordered-item="${CSS.escape(event.target.value)}"]`);
      if (!row) return;
      row.hidden = false; items.append(row); sync(list); onChange();
    });
    for (const button of list.querySelectorAll('[data-action="removeOrderedItem"]')) button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.closest("[data-ordered-item]").hidden = true; sync(list); onChange();
    });
    let dragged = null;
    items.addEventListener("dragstart", event => {
      dragged = event.target.closest?.("[data-ordered-item]") ?? null;
      if (dragged) { dragged.classList.add("rta-ordered-list__item--dragging"); event.dataTransfer.effectAllowed = "move"; }
    });
    items.addEventListener("dragover", event => {
      const over = event.target.closest?.("[data-ordered-item]");
      if (!dragged || !over || over === dragged) return;
      event.preventDefault();
      const {top, height} = over.getBoundingClientRect();
      over.parentElement.insertBefore(dragged, event.clientY < top + height / 2 ? over : over.nextSibling);
    });
    items.addEventListener("dragend", () => {
      if (!dragged) return;
      dragged.classList.remove("rta-ordered-list__item--dragging"); dragged = null; onChange();
    });
  }
}
