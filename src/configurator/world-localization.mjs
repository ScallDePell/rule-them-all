import {copyJSON, isRecord} from "./configurator-schema.mjs";

const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

export function validateWorldLocalizations(value, versionIds = null) {
  if (!isRecord(value)) throw new Error("worldLocalizations must be an object.");
  for (const [versionId, locales] of Object.entries(value)) {
    if (!nonEmpty(versionId) || !isRecord(locales)) throw new Error("Invalid world localization version entry.");
    if (versionIds && !versionIds.has(versionId)) throw new Error(`World localization targets unknown RulesetVersion: ${versionId}.`);
    for (const [locale, translations] of Object.entries(locales)) {
      if (!nonEmpty(locale) || !isRecord(translations)) throw new Error("Invalid world localization locale entry.");
      for (const [i18nKey, text] of Object.entries(translations)) {
        if (!nonEmpty(i18nKey) || typeof text !== "string") throw new Error("Invalid world localization translation entry.");
      }
    }
  }
  return value;
}

export function getWorldOverride(store, versionId, locale, i18nKey) {
  validateLocalizationIdentity(versionId, locale, i18nKey);
  const translations = store?.[versionId]?.[locale];
  return isRecord(translations) && Object.hasOwn(translations, i18nKey) ? translations[i18nKey] : undefined;
}

export function setWorldOverride(store, versionId, locale, i18nKey, value) {
  validateLocalizationIdentity(versionId, locale, i18nKey);
  if (typeof value !== "string") throw new TypeError("World localization value must be a string.");
  store[versionId] ??= {};
  store[versionId][locale] ??= {};
  store[versionId][locale][i18nKey] = value;
  return value;
}

export function deleteWorldOverride(store, versionId, locale, i18nKey) {
  validateLocalizationIdentity(versionId, locale, i18nKey);
  const translations = store?.[versionId]?.[locale];
  if (!isRecord(translations) || !Object.hasOwn(translations, i18nKey)) return false;
  delete translations[i18nKey];
  if (Object.keys(translations).length === 0) delete store[versionId][locale];
  if (Object.keys(store[versionId]).length === 0) delete store[versionId];
  return true;
}

export function copyVersionWorldOverrides(store, sourceVersionId, targetVersionId) {
  if (!nonEmpty(sourceVersionId) || !nonEmpty(targetVersionId)) throw new Error("versionId must be a non-empty string.");
  if (Object.hasOwn(store, targetVersionId)) throw new Error(`World localizations already exist for RulesetVersion: ${targetVersionId}.`);
  if (isRecord(store[sourceVersionId])) store[targetVersionId] = copyJSON(store[sourceVersionId]);
}

export function deleteVersionWorldOverrides(store, versionId) {
  if (!nonEmpty(versionId)) throw new Error("versionId must be a non-empty string.");
  delete store[versionId];
}

export function getVersionWorldOverrides(store, versionId) {
  if (!nonEmpty(versionId)) throw new Error("versionId must be a non-empty string.");
  return copyJSON(store[versionId] ?? {});
}

export function resolveLocalizedText({store, versionId, locale, i18nKey, localize}) {
  const override = getWorldOverride(store, versionId, locale, i18nKey);
  if (override !== undefined) return override;
  if (typeof localize !== "function") return i18nKey;
  const translated = localize(i18nKey);
  return typeof translated === "string" ? translated : i18nKey;
}

function validateLocalizationIdentity(versionId, locale, i18nKey) {
  if (!nonEmpty(versionId) || !nonEmpty(locale) || !nonEmpty(i18nKey)) {
    throw new Error("versionId, locale and i18nKey must be non-empty strings.");
  }
}
