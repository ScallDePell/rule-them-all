/* Sheet themes ("Thèmes de feuille"): a ready look a SheetDefinition takes in one go (its colors, fonts and frames),
   then adjusted with a few overrides. The look of each theme lives in styles/tokens.css, scoped to its class
   (.rta-sheet-theme--<id>); an override is a checked value written as the same tokens on the sheet. Pure.

   SheetDefinition.theme := {id, overrides?} | {themeRef, overrides?}
   id        parchment | gothic | scifi | plain: a theme of the module
   themeRef  a theme of the Ruleset (sheetThemes): one of the module's themes with overrides of its own, saved under a
             name for every sheet of the Ruleset (SheetTheme := {id, nameKey, base, overrides?}); the sheet's overrides
             come on top of the saved theme's
   overrides := {page?, panel?, text?, accent?, border?, field?, font?, titleFont?, frame?, frameSlice?, frameWidth?}
     page, panel, text, accent,   #rrggbb: the page behind the sheet, its sections, its text, its titles and highlights,
     border, field                its frames, its input fields
     font, titleFont               a font Foundry knows: the text's, the titles'
     frame                         a picture framing every section (border-image), cut frameSlice pixels from its edges
                                   (1-200, default 30) and drawn frameWidth wide (small, medium, large) */
import {isRecord} from "./configurator-schema.mjs";
import {FONT_NAME, HEX_COLOR, IMAGE_PATH, SHEET_FRAME_WIDTHS} from "./layout-style-contract.mjs";
import {freeId, readableId} from "./identity.mjs";

export const SHEET_THEMES = Object.freeze(["parchment", "gothic", "scifi", "plain"]);
/** Overrides that are colors, and the token each one writes. */
export const SHEET_THEME_COLORS = Object.freeze({page: "--rta-sheet-page", panel: "--rta-sheet-panel", text: "--rta-sheet-text", accent: "--rta-sheet-accent", border: "--rta-sheet-border", field: "--rta-sheet-field"});
/** Overrides that are fonts, and the token each one writes. */
export const SHEET_THEME_FONTS = Object.freeze({font: "--rta-sheet-font-body", titleFont: "--rta-sheet-font-title"});
export const SHEET_FRAME_SLICE = Object.freeze({min: 1, max: 200, initial: 30});
const OVERRIDES = [...Object.keys(SHEET_THEME_COLORS), ...Object.keys(SHEET_THEME_FONTS), "frame", "frameSlice", "frameWidth"];

/** The checked overrides of a theme ({} when none). */
function prepareOverrides(value, path) {
  const overrides = {};
  if (value === undefined || value === null) return overrides;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  for (const [key, entry] of Object.entries(value)) {
    if (!OVERRIDES.includes(key)) throw new Error(`${path} contains unsupported field: ${key}.`);
    if (entry === undefined || entry === null || entry === "") continue;
    const fail = what => { throw new Error(`${path}.${key} must be ${what}.`); };
    if (SHEET_THEME_COLORS[key] && !HEX_COLOR.test(entry)) fail("a #rrggbb color");
    if (SHEET_THEME_FONTS[key] && (typeof entry !== "string" || !FONT_NAME.test(entry))) fail("a font name");
    if (key === "frame" && (typeof entry !== "string" || !IMAGE_PATH.test(entry))) fail("a file path");
    if (key === "frameSlice" && (!Number.isSafeInteger(entry) || entry < SHEET_FRAME_SLICE.min || entry > SHEET_FRAME_SLICE.max)) fail(`${SHEET_FRAME_SLICE.min} to ${SHEET_FRAME_SLICE.max}`);
    if (key === "frameWidth" && !SHEET_FRAME_WIDTHS[entry]) fail(Object.keys(SHEET_FRAME_WIDTHS).join(", "));
    overrides[key] = entry;
  }
  return overrides;
}
const frameSizeNeedsFrame = (overrides, path) => {
  if ((overrides.frameSlice !== undefined || overrides.frameWidth !== undefined) && !overrides.frame) throw new Error(`${path}: a frame size needs a frame picture.`);
};

/** The checked theme of a SheetDefinition, or undefined when it has none. A themeRef is checked against the Ruleset
    with the other references (dependency-index.mjs). */
export function prepareSheetTheme(theme, path = "SheetDefinition.theme") {
  if (theme === undefined || theme === null) return undefined;
  if (!isRecord(theme) || Object.keys(theme).some(key => !["id", "themeRef", "overrides"].includes(key))) throw new Error(`${path} must be {id, overrides?} or {themeRef, overrides?}.`);
  if ((theme.id === undefined) === (theme.themeRef === undefined)) throw new Error(`${path} names either a theme of the module (id) or one of the Ruleset (themeRef).`);
  if (theme.id !== undefined && !SHEET_THEMES.includes(theme.id)) throw new Error(`${path}.id must be ${SHEET_THEMES.join(", ")}.`);
  if (theme.themeRef !== undefined && (typeof theme.themeRef !== "string" || !theme.themeRef.trim())) throw new Error(`${path}.themeRef must be the id of a Ruleset theme.`);
  const next = theme.id !== undefined ? {id: theme.id} : {themeRef: theme.themeRef};
  const overrides = prepareOverrides(theme.overrides, `${path}.overrides`);
  // The sheet's frame size may change the frame of the Ruleset theme it takes; only a module theme needs its own.
  if (theme.id !== undefined) frameSizeNeedsFrame(overrides, `${path}.overrides`);
  if (Object.keys(overrides).length) next.overrides = overrides;
  return next;
}

/** The checked body of a Ruleset theme: base (a theme of the module) and its overrides. */
export function prepareSheetThemeLook(x, path = "SheetTheme") {
  if (!SHEET_THEMES.includes(x.base)) throw new Error(`${path}.base must be ${SHEET_THEMES.join(", ")}.`);
  const overrides = prepareOverrides(x.overrides, `${path}.overrides`);
  frameSizeNeedsFrame(overrides, `${path}.overrides`);
  if (Object.keys(overrides).length) x.overrides = overrides; else delete x.overrides;
  return x;
}

/** The theme a sheet shows: a theme of the module with all its overrides ({id, overrides?}), the Ruleset theme it names
    resolved (its overrides, then the sheet's); null when it has none or names a Ruleset theme that is gone or off. */
export function resolveSheetTheme(theme, ruleset) {
  if (!theme) return null;
  if (theme.id) return theme;
  const saved = (ruleset?.sheetThemes ?? []).find(entry => entry.id === theme.themeRef && entry.enabled !== false);
  if (!saved || !SHEET_THEMES.includes(saved.base)) return null;
  const overrides = {...(saved.overrides ?? {}), ...(theme.overrides ?? {})};
  return {id: saved.base, ...(Object.keys(overrides).length ? {overrides} : {})};
}

/** A Ruleset theme of this name (to replace rather than add one more), or undefined. */
export const sheetThemeNamed = (ruleset, name) => (ruleset.sheetThemes ?? []).find(entry => entry.nameKey.trim().toLowerCase() === String(name).trim().toLowerCase());
/** A new Ruleset theme with the look a sheet shows now (theme: resolved): {id, nameKey, base, overrides?}. */
export function sheetThemeFromLook(theme, name, ruleset) {
  const taken = new Set((ruleset.sheetThemes ?? []).map(entry => entry.id));
  return {id: freeId(`theme-${readableId(name) || "sheet"}`, taken), nameKey: name, base: theme.id, ...(theme.overrides && Object.keys(theme.overrides).length ? {overrides: structuredClone(theme.overrides)} : {})};
}

/* Files. */
export const THEME_FILE_FORMAT = "rule-them-all.sheet-theme";
const FILE_VERSION = 1;
export const themeBody = theme => ({id: theme.id, nameKey: theme.nameKey, ...(theme.descriptionKey ? {descriptionKey: theme.descriptionKey} : {}), base: theme.base, ...(theme.overrides ? {overrides: structuredClone(theme.overrides)} : {})});
/** A Ruleset theme as a file. */
export const themeFile = theme => ({format: THEME_FILE_FORMAT, version: FILE_VERSION, theme: themeBody(theme)});
/** A theme file's theme, checked (its id free in this Ruleset); throws {code: "format"} on a file that is not one. */
export function readThemeFile(data, ruleset) {
  if (data?.format !== THEME_FILE_FORMAT || data.version !== FILE_VERSION || !isRecord(data.theme)) throw Object.assign(new Error("Not a sheet theme file."), {code: "format"});
  const {id, nameKey, descriptionKey, base, overrides} = data.theme;
  if (typeof nameKey !== "string" || !nameKey.trim()) throw new Error("SheetTheme.nameKey must be a name.");
  const look = prepareSheetThemeLook({base, overrides}, "SheetTheme");
  const taken = new Set((ruleset.sheetThemes ?? []).map(entry => entry.id));
  return {id: freeId(typeof id === "string" && id.trim() ? id : `theme-${readableId(nameKey) || "sheet"}`, taken), nameKey, ...(descriptionKey ? {descriptionKey} : {}), ...look};
}

const frameSize = (slice, width) => ({size: SHEET_FRAME_WIDTHS[width] ?? SHEET_FRAME_WIDTHS.medium,
  cut: Math.max(SHEET_FRAME_SLICE.min, Math.min(SHEET_FRAME_SLICE.max, Math.trunc(Number(slice)) || SHEET_FRAME_SLICE.initial))});
/** A border-image from a picture: the declarations a framed block (or every section of a framed theme) gets. */
export function frameDeclarations(src, slice = SHEET_FRAME_SLICE.initial, width = "medium") {
  if (!src || !IMAGE_PATH.test(src)) return [];
  const {cut, size} = frameSize(slice, width);
  return [`border-style: solid`, `border-width: ${size}`, `border-image: url("${src}") ${cut} / ${size} round`];
}

/** {classes, css}: what the .rta-sheet element of a themed sheet carries (its theme class, its overrides as tokens);
    theme: resolved (resolveSheetTheme). */
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
  return {classes: ["rta-sheet-themed", `rta-sheet-theme--${theme.id}`, ...(theme.id === "plain" ? HEX_COLOR.test(o.field ?? "") ? ["rta-sheet-themed--fields"] : [] : ["rta-sheet-themed--colored"]), ...(o.frame ? ["rta-sheet-themed--framed"] : [])], css};
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
