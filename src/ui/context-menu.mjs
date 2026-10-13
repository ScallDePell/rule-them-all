/* A right-click menu drawn with Foundry's own context menu markup (#context-menu as a popover), so it looks native.
   items: [{label, icon, run}]; one menu at a time, closed by a choice, a click elsewhere, Escape or a scroll. */
import {escapeHTML as escape} from "./html-utils.mjs";

export function contextMenuHTML(items) {
  return `<ol class="context-items">${items.map((item, i) => `<li class="context-item" data-context-item="${i}"><i class="${escape(item.icon ?? "fa-solid fa-circle")}" aria-hidden="true"></i><span>${escape(item.label)}</span></li>`).join("")}</ol>`;
}

let closeOpen = null;
export function openContextMenu(event, items, {document = globalThis.document} = {}) {
  event.preventDefault();
  closeOpen?.();
  if (!items.length) return null;
  const menu = document.createElement("nav");
  menu.id = "context-menu";
  menu.className = "themed theme-dark rta-context-menu";
  menu.setAttribute("popover", "manual");
  menu.innerHTML = contextMenuHTML(items);
  document.body.append(menu);
  menu.showPopover?.();
  // Keep the menu inside the window.
  const view = document.defaultView, box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(event.clientX, (view?.innerWidth ?? box.width) - box.width))}px`;
  menu.style.top = `${Math.max(0, Math.min(event.clientY, (view?.innerHeight ?? box.height) - box.height))}px`;
  const close = () => {
    menu.remove(); closeOpen = null;
    document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escapeKey, true); document.removeEventListener("scroll", close, true);
  };
  const outside = e => { if (!menu.contains(e.target)) close(); };
  const escapeKey = e => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  menu.addEventListener("click", e => {
    const row = e.target.closest?.("[data-context-item]");
    if (!row) return;
    close();
    items[Number(row.dataset.contextItem)]?.run?.();
  });
  document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", escapeKey, true); document.addEventListener("scroll", close, true);
  closeOpen = close;
  return menu;
}
