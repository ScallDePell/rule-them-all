import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {moduleLanguage, registerLanguageSetting, chosenLanguage, loadModuleTranslations, applyModuleTranslations, MODULE_LANGUAGES} from "../src/core/module-language.mjs";
import {selectUiText} from "../src/ui/select-text.mjs";

const lang = code => JSON.parse(readFileSync(new URL(`../lang/${code}.json`, import.meta.url), "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);

function settingsStub(values = {}) {
  const registered = new Map();
  return {registered, register: (namespace, key, data) => registered.set(`${namespace}.${key}`, data), get: (namespace, key) => values[`${namespace}.${key}`]};
}

test("each user picks the module language in Foundry's settings: automatic, French or English, applied on reload", () => {
  const settings = settingsStub();
  registerLanguageSetting(settings);
  const setting = settings.registered.get("rule-them-all.language");
  assert.equal(setting.scope, "client");
  assert.equal(setting.config, true);
  assert.equal(setting.requiresReload, true);
  assert.deepEqual(Object.keys(setting.choices), ["", "fr", "en"]);
  assert.equal(setting.default, "");
  assert.equal(chosenLanguage(settingsStub()), null);
  assert.equal(chosenLanguage(settingsStub({"rule-them-all.language": "en"})), "en");
  assert.equal(chosenLanguage(settingsStub({"rule-them-all.language": "xx"})), null);
});

test("the chosen language overrides Foundry's for the module only", () => {
  const prior = globalThis.game;
  try {
    globalThis.game = {i18n: {lang: "fr"}, ruleThemAll: {}};
    assert.equal(moduleLanguage(), "fr");
    globalThis.game.ruleThemAll.language = "en";
    assert.equal(moduleLanguage(), "en");
    assert.equal(selectUiText("GenericSelection"), "Selection");
    globalThis.game = {i18n: {lang: "en"}, ruleThemAll: {language: "fr"}};
    assert.equal(selectUiText("GenericSelection"), "Choix");
  } finally { globalThis.game = prior; }
});

test("the chosen file replaces the module's texts and leaves Foundry's own", async () => {
  const i18n = {translations: {SETTINGS: {Title: "Paramètres"}, RTA: {Settings: {Configurator: {Name: "Configurateur Rule Them'All"}}, OnlyHere: "kept"}}};
  const translations = await loadModuleTranslations("en", async path => { assert.match(path, /\/lang\/en\.json$/); return lang("en"); });
  assert.equal(applyModuleTranslations(i18n, translations), true);
  assert.equal(i18n.translations.RTA.Settings.Configurator.Name, "Rule Them'All Configurator");
  assert.equal(i18n.translations.SETTINGS.Title, "Paramètres");
  assert.equal(i18n.translations.RTA.OnlyHere, "kept");
  assert.equal(await loadModuleTranslations("xx", async () => assert.fail("unknown languages are not read")), null);
  assert.equal(applyModuleTranslations(i18n, null), false);
});

test("every shipped language has the same keys, all under RTA, so Foundry's merge keeps them", () => {
  const files = MODULE_LANGUAGES.map(lang);
  for (const file of files) assert.deepEqual(Object.keys(file), ["RTA"], "a dotted top-level key is erased by the nested RTA object when Foundry expands the file");
  const [first, ...others] = files.map(file => flat(file).sort());
  for (const keys of others) assert.deepEqual(keys, first);
  assert.ok(first.includes("RTA.Settings.Configurator.Hint"));
  assert.ok(first.includes("RTA.Settings.Language.Auto"));
});
