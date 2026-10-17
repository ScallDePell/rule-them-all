/* Sheet editor markup for block templates, cards, image frames and sheet themes. Pure; the controller
   (configurator/sheet-layout-controller.mjs) gives every choice already labelled and colored ({value, label, colors}).
   Data contract: [data-layout-template-command=rename|export|delete] (+ data-template-id) on a template of the palette,
   [data-layout-command=importTemplate | saveTemplate]; [data-layout-prop=cards|cardTemplate|cardFields] on a held-Contents
   block; [data-layout-style=frame|frameSlice|frameWidth] in the Style group; [data-layout-theme=<prop>] the sheet's theme
   ([data-layout-theme-reset=<prop>] takes an override back to the theme's), [data-layout-pick=frame][data-layout-pick-theme]. */
import {escapeHTML as escape} from "./html-utils.mjs";
import {localizedKeyMarkup as t} from "./ui-localization.mjs";
import {renderSelectOptions} from "./select-option-markup.mjs";

const row = (label, control) => `<div class="form-group rta-form-row"><label>${label}</label>${control}</div>`;
const options = (choices, selected) => renderSelectOptions(choices, {valueKey: "value", labelKey: "label", colorize: true, selectedValue: selected ?? ""});
const picture = (attribute, value) => `<div class="rta-sheet-editor__file"><input type="text" ${attribute} value="${escape(value ?? "")}" placeholder="${t("RTA.SheetEditor.ImagePath", "path/to/picture.webp")}"><button type="button" class="rta-config-action" data-layout-pick="frame"${attribute.startsWith("data-layout-theme") ? " data-layout-pick-theme" : " data-layout-pick-style"} title="${t("RTA.SheetEditor.Browse", "Browse")}" aria-label="${t("RTA.SheetEditor.Browse", "Browse")}"><i class="fa-solid fa-folder-open"></i></button></div>`;

/** A template of the palette's "Modèles" group: its rename, export and delete buttons. */
export function renderTemplateToolsHTML(templateId) {
  const button = (command, icon, key, fallback) => `<button type="button" class="rta-sheet-editor__template-tool" data-layout-template-command="${command}" data-template-id="${escape(templateId)}" title="${t(key, fallback)}" aria-label="${t(key, fallback)}"><i class="fa-solid ${icon}"></i></button>`;
  return `<span class="rta-sheet-editor__template-tools">${button("rename", "fa-pen", "RTA.SheetTemplate.Rename", "Rename")}${button("export", "fa-file-export", "RTA.SheetTemplate.Export", "Export as a file")}${button("delete", "fa-trash", "RTA.SheetTemplate.Delete", "Delete the template")}</span>`;
}
/** Below the templates: how to make one, and the import of a template file. */
export function renderTemplateFooterHTML(empty) {
  return `${empty ? `<p class="rta-sheet-editor__hint">${t("RTA.SheetTemplate.EmptyHint", "Select a block, then “Save as template”.")}</p>` : ""}<button type="button" class="rta-sheet-editor__wide" data-layout-command="importTemplate"><i class="fa-solid fa-file-import"></i> ${t("RTA.SheetTemplate.Import", "Import a template…")}</button>`;
}
/** The button of the selected block's settings that saves it as a template. */
export const renderSaveTemplateHTML = () => `<button type="button" class="rta-config-action" data-layout-command="saveTemplate" title="${t("RTA.SheetTemplate.Save", "Save as template")}" aria-label="${t("RTA.SheetTemplate.Save", "Save as template")}"><i class="fa-solid fa-bookmark"></i></button>`;

/** A held-Contents block's display: a list, or cards (a template, else the fields chosen). ctx: {cardModes, cardTemplates, cardFields}. */
export function renderCardSettingsHTML(node, ctx) {
  const rows = [row(t("RTA.SheetCards.Display", "Shown as"), `<select data-layout-prop="cards">${options(ctx.cardModes, node.cards ? "cards" : "list")}</select>`)];
  if (!node.cards) return rows;
  rows.push(row(t("RTA.SheetCards.Template", "Card"), `<select data-layout-prop="cardTemplate">${options(ctx.cardTemplates, node.cards.templateRef ?? "")}</select>`));
  if (!node.cards.templateRef) {
    const chosen = new Set(node.cards.fieldIds ?? []);
    rows.push(row(t("RTA.SheetCards.Fields", "Fields shown"), ctx.cardFields.length
      ? `<select multiple data-layout-prop="cardFields">${ctx.cardFields.map(choice => `<option value="${escape(choice.value)}" data-rta-colors="${escape(choice.colors)}"${chosen.has(choice.value) ? " selected" : ""}>${escape(choice.label)}</option>`).join("")}</select>`
      : `<p class="rta-sheet-editor__hint">${t("RTA.SheetCards.NoFields", "These Content Types have no fields.")}</p>`));
  }
  return rows;
}

/** The image frame rows of the Style group ("cadre image"). ctx: {frameWidths}. */
export function renderFrameRowsHTML(style, ctx) {
  const rows = [row(t("RTA.SheetTheme.Frame", "Image frame"), picture(`data-layout-style="frame"`, style.frame))];
  if (style.frame) {
    rows.push(row(t("RTA.SheetTheme.FrameSlice", "Cut from the edges (px)"), `<input type="number" min="1" max="200" step="1" data-layout-style="frameSlice" value="${escape(String(style.frameSlice ?? 30))}">`));
    rows.push(row(t("RTA.SheetTheme.FrameWidth", "Frame width"), `<select data-layout-style="frameWidth">${options(ctx.frameWidths, style.frameWidth ?? "medium")}</select>`));
  }
  return rows;
}

/** The sheet's look: a theme, then its colors, fonts and section frame changed for this sheet.
    theme: the SheetDefinition's ({id, overrides} or null); ctx: {open, themes, fonts(current), frameWidths}. */
export function renderSheetThemeHTML(theme, ctx) {
  const rows = [row(t("RTA.SheetTheme.Theme", "Theme"), `<select data-layout-theme="id">${options(ctx.themes, theme?.id ?? "none")}</select>`)];
  if (theme) {
    const o = theme.overrides ?? {};
    const color = (prop, key, fallback) => row(t(key, fallback), `<span class="rta-sheet-editor__theme-color"><input type="color" data-layout-theme="${prop}" value="${escape(o[prop] ?? ctx.color(prop))}">${o[prop] ? `<button type="button" class="rta-config-action" data-layout-theme-reset="${prop}" title="${t("RTA.SheetTheme.Reset", "The theme's")}" aria-label="${t("RTA.SheetTheme.Reset", "The theme's")}"><i class="fa-solid fa-rotate-left"></i></button>` : ""}</span>`);
    rows.push(color("page", "RTA.SheetTheme.Page", "Page"), color("text", "RTA.SheetTheme.Text", "Text"), color("accent", "RTA.SheetTheme.Accent", "Titles and highlights"), color("border", "RTA.SheetTheme.Border", "Frames"));
    rows.push(row(t("RTA.SheetTheme.Font", "Text font"), `<select data-layout-theme="font">${options(ctx.fonts(o.font), o.font ?? "default")}</select>`));
    rows.push(row(t("RTA.SheetTheme.TitleFont", "Title font"), `<select data-layout-theme="titleFont">${options(ctx.fonts(o.titleFont), o.titleFont ?? "default")}</select>`));
    rows.push(row(t("RTA.SheetTheme.SectionFrame", "Section frame"), picture(`data-layout-theme="frame"`, o.frame)));
    if (o.frame) {
      rows.push(row(t("RTA.SheetTheme.FrameSlice", "Cut from the edges (px)"), `<input type="number" min="1" max="200" step="1" data-layout-theme="frameSlice" value="${escape(String(o.frameSlice ?? 30))}">`));
      rows.push(row(t("RTA.SheetTheme.FrameWidth", "Frame width"), `<select data-layout-theme="frameWidth">${options(ctx.frameWidths, o.frameWidth ?? "medium")}</select>`));
    }
  }
  return `<div class="rta-sheet-editor__theme" data-layout-theme-panel><div class="rta-sheet-editor__style-body">${rows.join("")}</div></div>`;
}
