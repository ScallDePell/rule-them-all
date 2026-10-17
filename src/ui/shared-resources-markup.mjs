/* The shared resources panel: the world's resources, then the combat in progress's, one row per value or pool slot.
   Pure: renderSharedResourcesHTML writes what describeShared (runtime/shared-resources.mjs) returned.
   Data contract read by the window (runtime/foundry-shared-resources.mjs): [data-shared-value] the number of a row the
   user may change (data-holder, data-definition, data-slot), [data-shared-step] its −/+ (−1 or 1). */
import {escapeHTML as escape} from "./html-utils.mjs";

const HOLDER_TITLE = {world: "RTA.Shared.World", combat: "RTA.Shared.CurrentCombat"};

function rowHTML(group, row, t) {
  const label = row.slotName ? `${t(row.nameKey)} · ${t(row.slotName)}` : t(row.nameKey), id = `rta-shared-${group.holder}-${row.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  if (row.value === null) return `<div class="rta-shared__row"><span>${escape(label)}</span><span class="rta-shared__empty">—</span></div>`;
  if (!row.writable) return `<div class="rta-shared__row"><span>${escape(label)}</span><strong class="rta-shared__number">${escape(row.value)}${row.maximum !== null ? ` / ${escape(row.maximum)}` : ""}</strong></div>`;
  const step = delta => `<button type="button" class="rta-shared__stepper" data-shared-step="${delta}" aria-label="${escape(`${t(delta < 0 ? "RTA.Creation.Less" : "RTA.Creation.More")} ${label}`)}">${delta < 0 ? "−" : "+"}</button>`;
  const bounds = `${row.minimum !== null ? ` min="${escape(row.minimum)}"` : ""}${row.maximum !== null ? ` max="${escape(row.maximum)}"` : ""}`;
  return `<div class="rta-shared__row"><label for="${id}">${escape(label)}</label><span class="rta-shared__value">${step(-1)}<input type="number" id="${id}" step="1"${bounds} value="${escape(row.value)}" data-shared-value data-holder="${group.holder}" data-definition="${escape(row.definitionId)}" data-slot="${escape(row.slotId ?? "")}">${step(1)}<span class="rta-shared__max">${row.maximum !== null ? `/ ${escape(row.maximum)}` : ""}</span></span></div>`;
}

/** groups: describeShared's result; t: Ruleset text first, then the module's. */
export function renderSharedResourcesHTML(groups, {t}) {
  if (!groups.length) return `<div class="rta-shared"><p>${escape(t("RTA.Shared.None"))}</p></div>`;
  const sections = groups.map(group => {
    const body = !group.ref ? `<p class="rta-shared__empty">${escape(t("RTA.Shared.NoCombat"))}</p>`
      : group.rows.length ? group.rows.map(row => rowHTML(group, row, t)).join("") : `<p class="rta-shared__empty">${escape(t("RTA.Shared.Hidden"))}</p>`;
    return `<section class="rta-shared__group"><h3>${escape(t(HOLDER_TITLE[group.holder]))}</h3>${body}</section>`;
  });
  return `<div class="rta-shared">${sections.join("")}</div>`;
}
