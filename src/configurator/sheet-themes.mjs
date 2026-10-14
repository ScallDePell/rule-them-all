/* Sheet themes ("Thèmes de feuille"): a ready look a SheetDefinition takes in one go (its colors, fonts and frames),
   then adjusted with a few overrides. The look of each theme lives in styles/tokens.css, scoped to its class
   (.rta-sheet-theme--<id>); an override is a checked value written as the same tokens on the sheet. Pure.

   SheetDefinition.theme := {id, overrides?}
   id        parchment | gothic | scifi | plain
   overrides := {page?, text?, accent?, border?, font?, titleFont?, frame?, frameSlice?, frameWidth?}
     page, text, accent, border   #rrggbb: the page behind the sheet, its text, its titles and highlights, its frames
     font, titleFont               a font Foundry knows: the text's, the titles'
     frame                         a picture framing every section (border-image), cut frameSlice pixels from its edges
                                   (1-200, default 30) and drawn frameWidth wide (small, medium, large) */
import {isRecord} from "./configurator-schema.mjs";
import {FONT_NAME, HEX_COLOR, IMAGE_PATH, SHEET_FRAME_WIDTHS} from "./layout-style-contract.mjs";

export const SHEET_THEMES = Object.freeze(["parchment", "gothic", "scifi", "plain"]);
/** Overrides that are colors, and the token each one writes. */
export const SHEET_THEME_COLORS = Object.freeze({page: "--rta-sheet-page", text: "--rta-sheet-text", accent: "--rta-sheet-accent", border: "--rta-sheet-border"});
/** Overrides that are fonts, and the token each one writes. */
export const SHEET_THEME_FONTS = Object.freeze({font: "--rta-sheet-font-body", titleFont: "--rta-sheet-font-title"});
export const SHEET_FRAME_SLICE = Object.freeze({min: 1, max: 200, initial: 30});
const OVERRIDES = [...Object.keys(SHEET_THEME_COLORS), ...Object.keys(SHEET_THEME_FONTS), "frame", "frameSlice", "frameWidth"];

/** The checked theme of a SheetDefinition, or undefined when it has none. */
export function prepareSheetTheme(theme, path = "SheetDefinition.theme") {
  if (theme === undefined || theme === null) return undefined;
  if (!isRecord(theme) || Object.keys(theme).some(key => !["id", "overrides"].includes(key))) throw new Error(`${path} must be {id, overrides?}.`);
  if (!SHEET_THEMES.includes(theme.id)) throw new Error(`${path}.id must be ${SHEET_THEMES.join(", ")}.`);
  const next = {id: theme.id}, overrides = {};
  if (theme.overrides !== undefined && theme.overrides !== null) {
    if (!isRecord(theme.overrides)) throw new Error(`${path}.overrides must be an object.`);
    for (const [key, value] of Object.entries(theme.overrides)) {
      if (!OVERRIDES.includes(key)) throw new Error(`${path}.overrides contains unsupported field: ${key}.`);
      if (value === undefined || value === null || value === "") continue;
      const fail = what => { throw new Error(`${path}.overrides.${key} must be ${what}.`); };
      if (SHEET_THEME_COLORS[key] && !HEX_COLOR.test(value)) fail("a #rrggbb color");
      if (SHEET_THEME_FONTS[key] && (typeof value !== "string" || !FONT_NAME.test(value))) fail("a font name");
      if (key === "frame" && (typeof value !== "string" || !IMAGE_PATH.test(value))) fail("a file path");
      if (key === "frameSlice" && (!Number.isSafeInteger(value) || value < SHEET_FRAME_SLICE.min || value > SHEET_FRAME_SLICE.max)) fail(`${SHEET_FRAME_SLICE.min} to ${SHEET_FRAME_SLICE.max}`);
      if (key === "frameWidth" && !SHEET_FRAME_WIDTHS[value]) fail(Object.keys(SHEET_FRAME_WIDTHS).join(", "));
      overrides[key] = value;
    }
    if ((overrides.frameSlice !== undefined || overrides.frameWidth !== undefined) && !overrides.frame) throw new Error(`${path}.overrides: a frame size needs a frame picture.`);
  }
  if (Object.keys(overrides).length) next.overrides = overrides;
  return next;
}

const frameSize = (slice, width) => ({size: SHEET_FRAME_WIDTHS[width] ?? SHEET_FRAME_WIDTHS.medium,
  cut: Math.max(SHEET_FRAME_SLICE.min, Math.min(SHEET_FRAME_SLICE.max, Math.trunc(Number(slice)) || SHEET_FRAME_SLICE.initial))});
/** A border-image from a picture: the declarations a framed block (or every section of a framed theme) gets. */
export function frameDeclarations(src, slice = SHEET_FRAME_SLICE.initial, width = "medium") {
  if (!src || !IMAGE_PATH.test(src)) return [];
  const {cut, size} = frameSize(slice, width);
  return [`border-style: solid`, `border-width: ${size}`, `border-image: url("${src}") ${cut} / ${size} round`];
}

/** {classes, css}: what the .rta-sheet element of a themed sheet carries (its theme class, its overrides as tokens). */
export function sheetThemeAttributes(theme) {
  if (!theme || !SHEET_THEMES.includes(theme.id)) return {classes: [], css: []};
  const css = [], o = theme.overrides ?? {};
  for (const [key, token] of Object.entries(SHEET_THEME_COLORS)) if (HEX_COLOR.test(o[key] ?? "")) css.push(`${token}: ${o[key]}`);
  for (const [key, token] of Object.entries(SHEET_THEME_FONTS)) if (FONT_NAME.test(o[key] ?? "")) css.push(`${token}: "${o[key]}"`);
  // A frame picture: every section of the sheet takes it instead of its line.
  if (o.frame && IMAGE_PATH.test(o.frame)) {
    const {cut, size} = frameSize(o.frameSlice, o.frameWidth);
    css.push(`--rta-sheet-section-frame: url("${o.frame}") ${cut} / ${size} round`, `--rta-sheet-section-frame-width: ${size}`);
  }
  return {classes: ["rta-sheet-themed", `rta-sheet-theme--${theme.id}`, ...(theme.id === "plain" ? [] : ["rta-sheet-themed--colored"]), ...(o.frame ? ["rta-sheet-themed--framed"] : [])], css};
}

/** The fonts Foundry offers: its own and those the GM adds in its font settings (CONFIG.fontDefinitions); a short list
    of Foundry's core fonts when Foundry is not there (tests, QA). */
export const FALLBACK_FONTS = Object.freeze(["Signika", "Modesto Condensed", "Amiri", "Bruno Ace", "Arial", "Times New Roman", "Courier New"]);
export function availableFonts() {
  const config = globalThis.foundry?.applications?.settings?.menus?.FontConfig;
  const found = new Set();
  try { for (const font of config?.getAvailableFonts?.() ?? []) found.add(font); } catch { /* the font settings are not ready */ }
  for (const font of Object.keys(globalThis.CONFIG?.fontDefinitions ?? {})) found.add(font);
  const fonts = [...found].filter(font => FONT_NAME.test(font));
  return fonts.length ? fonts.sort((a, b) => a.localeCompare(b)) : [...FALLBACK_FONTS];
}
