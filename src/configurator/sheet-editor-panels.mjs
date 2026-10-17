/* The sheet editor's side panels (the tools on the left, the Layers on the right): the bar between a panel and the
   sheet is dragged to set the panel's width (a double click gives it back its own) and its button hides or shows the
   panel. Each user's choice is kept in the browser, the same for every sheet. host: [data-sheet-layout-editor]. */
const KEY = "rule-them-all.sheetEditorPanels";
/** The widths a panel may take, in pixels. */
export const PANEL_LIMITS = Object.freeze({side: [224, 640], layers: [160, 480]});
const ICONS = {side: ["fa-angles-left", "fa-angles-right"], layers: ["fa-angles-right", "fa-angles-left"]};

const i18n = (key, fallback) => { const text = globalThis.game?.i18n?.localize?.(key); return text && text !== key ? text : fallback; };

/** The kept choice: {side: {width, hidden}, layers: {width, hidden}}; width null is the panel's own. */
export function readPanels(storage = globalThis.localStorage) {
  let stored = null;
  try { stored = JSON.parse(storage?.getItem(KEY) ?? "null"); } catch { stored = null; }
  const panel = name => ({width: Number.isFinite(stored?.[name]?.width) ? clampWidth(name, stored[name].width) : null, hidden: stored?.[name]?.hidden === true});
  return {side: panel("side"), layers: panel("layers")};
}
function savePanels(panels, storage = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(panels)); } catch { /* private window: the choice lasts this window */ } }
export const clampWidth = (name, width) => Math.round(Math.min(PANEL_LIMITS[name][1], Math.max(PANEL_LIMITS[name][0], Number(width))));

/** Show the choice on the editor: its widths as CSS variables, a hidden panel as a class, each button's icon and label. */
export function applyPanels(host, panels) {
  for (const name of ["side", "layers"]) {
    const {width, hidden} = panels[name];
    if (width === null) host.style.removeProperty(`--rta-sheet-${name}-width`); else host.style.setProperty(`--rta-sheet-${name}-width`, `${width}px`);
    host.classList.toggle(`rta-sheet-editor--hide-${name}`, hidden);
    const button = host.querySelector(`[data-panel-toggle="${name}"]`);
    if (!button) continue;
    const label = hidden ? i18n(`RTA.SheetEditor.Panels.Show.${name}`, name === "side" ? "Show the tools" : "Show the layers") : i18n(`RTA.SheetEditor.Panels.Hide.${name}`, name === "side" ? "Hide the tools" : "Hide the layers");
    button.title = label; button.setAttribute("aria-label", label); button.setAttribute("aria-expanded", String(!hidden));
    button.querySelector("i")?.classList.remove(...ICONS[name]);
    button.querySelector("i")?.classList.add(ICONS[name][hidden ? 1 : 0]);
  }
}

export function installPanels(host, {storage = globalThis.localStorage} = {}) {
  let panels = readPanels(storage);
  applyPanels(host, panels);
  const keep = next => { panels = next; applyPanels(host, panels); savePanels(panels, storage); };
  for (const bar of host.querySelectorAll("[data-panel-resizer]")) {
    const name = bar.dataset.panelResizer;
    bar.querySelector("[data-panel-toggle]")?.addEventListener("click", () => keep({...panels, [name]: {...panels[name], hidden: !panels[name].hidden}}));
    bar.addEventListener("dblclick", event => { if (!event.target.closest("[data-panel-toggle]")) keep({...panels, [name]: {width: null, hidden: false}}); });
    bar.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("[data-panel-toggle]") || panels[name].hidden) return;
      event.preventDefault();
      bar.setPointerCapture?.(event.pointerId);
      bar.dataset.panelDragging = "";
      const box = host.getBoundingClientRect();
      const move = e => { panels = {...panels, [name]: {...panels[name], width: clampWidth(name, name === "side" ? e.clientX - box.left : box.right - e.clientX)}}; applyPanels(host, panels); };
      const end = () => { delete bar.dataset.panelDragging; bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", end); bar.removeEventListener("pointercancel", end); savePanels(panels, storage); };
      bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
    });
  }
}
