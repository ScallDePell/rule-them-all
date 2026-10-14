/* Sheet styles as HTML: a node's style (configurator/layout-style-contract.mjs) written as classes and inline
   declarations that use the module's tokens. Pure: no Foundry access. */
import {escapeHTML as escape} from "./html-utils.mjs";
import {FONT_NAME, HEX_COLOR, IMAGE_PATH, SHEET_ALIGNS, SHEET_BACKGROUND_FITS, SHEET_BACKGROUND_POSITIONS, SHEET_GAPS, SHEET_NO_COLOR, SHEET_SIZES, SHEET_SPACES, SHEET_TONES} from "../configurator/layout-style-contract.mjs";

const colorValue = value => HEX_COLOR.test(value) ? value : SHEET_TONES[value] ? `var(${SHEET_TONES[value]})` : null;
const percent = value => Math.max(0, Math.min(100, Number(value)));

/** {classes, css, gap}: the classes and inline declarations of a node's style; gap goes on the grid its children flow in. */
export function sheetStyle(node) {
  const style = node?.style ?? {}, css = [], classes = [];
  // A section's opacity alone fades its usual background.
  const background = style.background ?? (node?.kind === "section" && style.opacity !== undefined ? "panel" : undefined);
  const color = colorValue(style.color);
  if (color) { css.push(`color: ${color}`); classes.push("rta-sheet-colored"); }
  if (background === SHEET_NO_COLOR) css.push("background: none");
  else if (colorValue(background) && !["image", "portrait", "token"].includes(node.kind)) css.push(`background-color: ${style.opacity === undefined ? colorValue(background) : `color-mix(in srgb, ${colorValue(background)} ${percent(style.opacity)}%, transparent)`}`);
  if (style.image && IMAGE_PATH.test(style.image)) {
    const [size, repeat] = SHEET_BACKGROUND_FITS[style.imageFit] ?? SHEET_BACKGROUND_FITS.cover;
    css.push(`background-image: url("${style.image}")`, `background-size: ${size}`, `background-repeat: ${repeat}`, `background-position: ${SHEET_BACKGROUND_POSITIONS.includes(style.imagePosition) ? style.imagePosition : "center"}`);
  }
  if (style.border === SHEET_NO_COLOR) css.push("border: 0");
  else if (colorValue(style.border)) css.push(`border: var(--rta-frame-border) solid ${colorValue(style.border)}`);
  if (style.border && style.border !== SHEET_NO_COLOR && !["section"].includes(node.kind)) css.push("border-radius: var(--rta-radius-panel)");
  if (style.font && FONT_NAME.test(style.font)) { css.push(`font-family: "${style.font}", var(--font-body)`); classes.push("rta-sheet-fonted"); }
  if (SHEET_SIZES[style.size]) css.push(`font-size: var(${SHEET_SIZES[style.size]})`);
  if (style.bold) css.push("font-weight: 700");
  if (style.italic) css.push("font-style: italic");
  if (SHEET_ALIGNS.includes(style.align)) { css.push(`text-align: ${style.align}`); classes.push(`rta-sheet-align-${style.align}`); }
  if (SHEET_SPACES[style.padding]) css.push(`padding: ${SHEET_SPACES[style.padding]}`);
  if (style.label === "top" || style.label === "hidden") classes.push(`rta-sheet-value--label-${style.label}`);
  // A gauge (or dots) fills with one color, or a gradient from the first to the second.
  const fill = colorValue(style.fill), fillTo = colorValue(style.fillTo);
  if (fill || fillTo) css.push(`--rta-sheet-fill: ${fill && fillTo ? `linear-gradient(to right, ${fill}, ${fillTo})` : fill ?? fillTo}`, `--rta-sheet-fill-solid: ${fill ?? fillTo}`);
  return {classes, css, gap: SHEET_GAPS.includes(style.gap) ? `var(--rta-gap-${style.gap})` : null};
}

/** class and style attributes for an element: its own classes and declarations, then the node's style. */
export function styledAttributes(node, baseClass, declarations = []) {
  const {classes, css} = sheetStyle(node), all = [...declarations, ...css];
  return `class="${[baseClass, ...classes].filter(Boolean).join(" ")}"${all.length ? ` style="${escape(all.join("; "))}"` : ""}`;
}
