/* Sheet styles (CP-14): the closed vocabulary of what the sheet editor lets a GM change on a block. Never free CSS:
   every setting is a choice checked here (prepareLayoutStyle) and written by ui/sheet-style.mjs with the module's tokens.

   style := {color?, background?, opacity?, border?, image?, font?, size?, bold?, italic?, align?, padding?, gap?, label?}
   color, background, border  a theme tone (SHEET_TONES, it follows Foundry's light or dark theme) or a #rrggbb;
                              background and border may be "none" (a section without its frame)
   opacity                    0-100: the background's opacity (an image block: the image's)
   image                      a background picture (containers): a file path or URL
   imageFit                   how that picture fills the block: cover (default) | contain | stretch | natural | tile
   imagePosition              where it sits: center (default) | top | bottom | left | right
   font                       a font family Foundry knows (its own and those the world adds)
   size                       small | normal | large | huge
   bold, italic               true
   align                      start | center | end
   padding                    none | tight | row | block (0, 4, 8, 12 px)
   gap                        tight | row | block: between the blocks of a container
   label                      side | top | hidden: where a value shows its label
   fill, fillTo               a gauge's (or dots') color, and the second color of its gradient (values only) */
import {isRecord} from "./configurator-schema.mjs";

/** Theme tones a color setting can name, each a token of tokens.css. */
export const SHEET_TONES = Object.freeze({
  text: "--rta-color-text", muted: "--rta-color-text-secondary", accent: "--rta-color-accent-warm", highlight: "--rta-color-border-highlight",
  success: "--rta-color-success", danger: "--rta-color-danger", warning: "--rta-color-warning",
  panel: "--rta-color-surface-option-light", surface: "--rta-color-surface", light: "--rta-color-inverse-fill", dark: "--rta-color-inverse-text"
});
export const SHEET_COLOR_PROPS = Object.freeze(["color", "background", "border", "fill", "fillTo"]);
/** Colors only a value has: the fill of its gauge or dots. */
export const SHEET_FILL_PROPS = Object.freeze(["fill", "fillTo"]);
/** Background and border may also be removed ("none"): a section without its frame. */
export const SHEET_NO_COLOR = "none";
export const SHEET_SIZES = Object.freeze({small: "--rta-type-sm", normal: "--rta-type-control", large: "--rta-type-heading", huge: "--rta-type-display"});
export const SHEET_ALIGNS = Object.freeze(["start", "center", "end"]);
export const SHEET_SPACES = Object.freeze({none: "0", tight: "var(--rta-gap-tight)", row: "var(--rta-gap-row)", block: "var(--rta-gap-block)"});
export const SHEET_GAPS = Object.freeze(["tight", "row", "block"]);
export const SHEET_LABELS = Object.freeze(["side", "top", "hidden"]);
export const SHEET_IMAGE_FITS = Object.freeze(["cover", "contain"]);
/** A background picture: how it fills its block (as CSS background-size and background-repeat) and where it sits. */
export const SHEET_BACKGROUND_FITS = Object.freeze({cover: ["cover", "no-repeat"], contain: ["contain", "no-repeat"], stretch: ["100% 100%", "no-repeat"], natural: ["auto", "no-repeat"], tile: ["auto", "repeat"]});
export const SHEET_BACKGROUND_POSITIONS = Object.freeze(["center", "top", "bottom", "left", "right"]);
export const SHEET_IMAGE_HEIGHTS = Object.freeze({small: "4rem", medium: "8rem", large: "14rem"});
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** A font family name as Foundry lists them (its own fonts and those a world adds). */
export const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _'-]{0,63}$/;
/** A file path or URL: nothing that could end a CSS url() or an HTML attribute. */
export const IMAGE_PATH = /^[^"\\<>\r\n]+$/;


const CONTAINER_ONLY = ["image", "imageFit", "imagePosition", "gap"];
/** The checked style of a node of this kind, or undefined when it sets nothing. */
export function prepareLayoutStyle(style, kind, path, {containers = []} = {}) {
  if (style === undefined || style === null) return undefined;
  if (!isRecord(style)) throw new Error(`${path} must be an object.`);
  const next = {}, fail = (key, what) => { throw new Error(`${path}.${key} must be ${what}.`); };
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (SHEET_COLOR_PROPS.includes(key)) {
      if (!(HEX_COLOR.test(value) || SHEET_TONES[value] || ["background", "border"].includes(key) && value === SHEET_NO_COLOR)) fail(key, "a tone or a #rrggbb color");
      if (SHEET_FILL_PROPS.includes(key) && kind !== "value") fail(key, "on a value");
    }
    else if (key === "opacity") { if (!Number.isInteger(value) || value < 0 || value > 100) fail(key, "0 to 100"); }
    else if (key === "image") { if (typeof value !== "string" || !IMAGE_PATH.test(value)) fail(key, "a file path"); }
    else if (key === "imageFit") { if (!SHEET_BACKGROUND_FITS[value] || !style.image) fail(key, `${Object.keys(SHEET_BACKGROUND_FITS).join(", ")}, with a background picture`); }
    else if (key === "imagePosition") { if (!SHEET_BACKGROUND_POSITIONS.includes(value) || !style.image) fail(key, `${SHEET_BACKGROUND_POSITIONS.join(", ")}, with a background picture`); }
    else if (key === "font") { if (typeof value !== "string" || !FONT_NAME.test(value)) fail(key, "a font name"); }
    else if (key === "size") { if (!SHEET_SIZES[value]) fail(key, Object.keys(SHEET_SIZES).join(", ")); }
    else if (key === "bold" || key === "italic") { if (value !== true) fail(key, "true"); }
    else if (key === "align") { if (!SHEET_ALIGNS.includes(value)) fail(key, SHEET_ALIGNS.join(", ")); }
    else if (key === "padding") { if (!SHEET_SPACES[value]) fail(key, Object.keys(SHEET_SPACES).join(", ")); }
    else if (key === "gap") { if (!SHEET_GAPS.includes(value)) fail(key, SHEET_GAPS.join(", ")); }
    else if (key === "label") { if (!SHEET_LABELS.includes(value) || kind !== "value") fail(key, `${SHEET_LABELS.join(", ")} on a value`); }
    else throw new Error(`${path} contains unsupported field: ${key}.`);
    if (CONTAINER_ONLY.includes(key) && !containers.includes(kind)) throw new Error(`${path}.${key} is only on containers.`);
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}
