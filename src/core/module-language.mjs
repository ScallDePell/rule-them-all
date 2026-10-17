import {MODULE_ID} from "./module-contract.mjs";

/** The interface languages the module ships, in lang/<code>.json. */
export const MODULE_LANGUAGES = Object.freeze(["fr", "en"]);
export const LANGUAGE_SETTING = "language";

/** The module's interface language: the user's Rule Them'All choice, else Foundry's own. */
export function moduleLanguage() {
  return globalThis.game?.ruleThemAll?.language || globalThis.game?.i18n?.lang || globalThis.document?.documentElement?.lang || "en";
}

/** Per user: "" follows Foundry's language; a code replaces the module's texts, not Foundry's. */
export function registerLanguageSetting(settings) {
  settings.register(MODULE_ID, LANGUAGE_SETTING, {
    name: "RTA.Settings.Language.Name",
    hint: "RTA.Settings.Language.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {"": "RTA.Settings.Language.Auto", fr: "Français", en: "English"},
    default: "",
    requiresReload: true
  });
}

/** The chosen language, or null when the module follows Foundry's. */
export function chosenLanguage(settings) {
  let value = "";
  try { value = settings.get(MODULE_ID, LANGUAGE_SETTING) ?? ""; } catch { value = ""; }
  return MODULE_LANGUAGES.includes(value) ? value : null;
}

/** Fetches lang/<code>.json; null when it cannot be read. */
export async function loadModuleTranslations(language, fetchJSON = path => globalThis.fetch(path).then(response => response.ok ? response.json() : null)) {
  if (!MODULE_LANGUAGES.includes(language)) return null;
  try { return await fetchJSON(new URL(`../../lang/${language}.json`, import.meta.url).href); }
  catch (error) { console.error(`Rule Them'All | Language ${language} unreadable`, error); return null; }
}

/** Writes the module's own keys (RTA.*) over Foundry's loaded translations, nothing else. */
export function applyModuleTranslations(i18n, translations) {
  const own = translations?.RTA;
  if (!i18n?.translations || !own || typeof own !== "object") return false;
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value)) merge(target[key] && typeof target[key] === "object" ? target[key] : (target[key] = {}), value);
      else target[key] = value;
    }
  };
  merge(i18n.translations.RTA && typeof i18n.translations.RTA === "object" ? i18n.translations.RTA : (i18n.translations.RTA = {}), own);
  return true;
}
