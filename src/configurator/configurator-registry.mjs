import {copyJSON, createRulesetData, isRecord} from "./configurator-schema.mjs";
import {assertValidRuleset, assertValidRulesetSchema} from "./configurator-validation.mjs";
import {readStorageSnapshot} from "./configurator-storage.mjs";
import {DependencyIndex} from "./dependency-index.mjs";
import {createStableId} from "./identity.mjs";
import {copyVersionWorldOverrides, deleteVersionWorldOverrides, deleteWorldOverride, getVersionWorldOverrides, getWorldOverride, resolveLocalizedText, setWorldOverride} from "./world-localization.mjs";

/** Ruleset families and independently persisted versions. */
export class ConfiguratorRegistry {
  #families = new Map();
  #versionFamily = new Map();
  #storageRevision = 0;
  #activeVersionId = null;
  #worldLocalizations = {};

  snapshot() {
    return {
      storageVersion: 3,
      storageRevision: this.#storageRevision,
      activeVersionId: this.#activeVersionId,
      rulesetFamilies: this.listFamilies(),
      worldLocalizations: copyJSON(this.#worldLocalizations)
    };
  }
  hydrate(value) {
    const snapshot = readStorageSnapshot(value);
    const families = new Map(), versionFamily = new Map();
    for (const family of snapshot.rulesetFamilies) {
      const versions = new Map();
      for (const record of family.versions) {
        versions.set(record.versionId, copyJSON(record));
        versionFamily.set(record.versionId, family.id);
      }
      families.set(family.id, {id: family.id, versions});
    }
    this.#families = families;
    this.#versionFamily = versionFamily;
    this.#storageRevision = snapshot.storageRevision;
    this.#activeVersionId = snapshot.activeVersionId;
    this.#worldLocalizations = copyJSON(snapshot.worldLocalizations);
  }
  getStorageRevision() { return this.#storageRevision; }
  getActiveVersionId() { return this.#activeVersionId; }
  getWorldOverride(versionId, locale, i18nKey) { this.#requireRecord(versionId); return getWorldOverride(this.#worldLocalizations, versionId, locale, i18nKey); }
  getVersionWorldOverrides(versionId) { this.#requireRecord(versionId); return getVersionWorldOverrides(this.#worldLocalizations, versionId); }
  setWorldOverride(versionId, locale, i18nKey, value) { this.#requireMutable(versionId); return setWorldOverride(this.#worldLocalizations, versionId, locale, i18nKey, value); }
  deleteWorldOverride(versionId, locale, i18nKey) { this.#requireMutable(versionId); return deleteWorldOverride(this.#worldLocalizations, versionId, locale, i18nKey); }
  resolveLocalizedText(versionId, locale, i18nKey, localize) { this.#requireRecord(versionId); return resolveLocalizedText({store: this.#worldLocalizations, versionId, locale, i18nKey, localize}); }
  setActiveVersionId(versionId) {
    if (versionId !== null) {
      const record = this.#requireRecord(versionId);
      if (!record.publishedSnapshot) {
        const error = new Error(`RulesetVersion is not activable before publication: ${versionId}.`);
        error.code = "VERSION_NOT_ACTIVABLE";
        throw error;
      }
      assertValidRuleset(record.publishedSnapshot);
    }
    this.#activeVersionId = versionId;
    return versionId;
  }

  listFamilies() {
    return Array.from(this.#families.values(), family => ({
      id: family.id,
      versions: Array.from(family.versions.values(), value => copyJSON(value))
    }));
  }
  listVersions(rulesetId) {
    const family = this.#families.get(rulesetId);
    return family ? Array.from(family.versions.values(), value => copyJSON(value)) : [];
  }
  list() { return this.listFamilies().flatMap(f => f.versions.map(v => copyJSON(v.workingDraft))); }
  getRecord(versionId) {
    const familyId = this.#versionFamily.get(versionId);
    const record = familyId === undefined ? undefined : this.#families.get(familyId)?.versions.get(versionId);
    return record === undefined ? undefined : copyJSON(record);
  }
  get(versionId) { return this.getRecord(versionId)?.workingDraft; }
  getPublished(versionId) { return this.getRecord(versionId)?.publishedSnapshot ?? undefined; }
  #requireRecord(versionId) {
    const familyId = this.#versionFamily.get(versionId);
    const record = familyId === undefined ? undefined : this.#families.get(familyId)?.versions.get(versionId);
    if (!record) throw new Error(`RulesetVersion not found: ${versionId}.`);
    return record;
  }
  #requireMutable(versionId) {
    const record = this.#requireRecord(versionId);
    if (record.status === "validated") {
      const error = new Error(`Validated RulesetVersion is immutable: ${versionId}.`);
      error.code = "VERSION_IMMUTABLE";
      throw error;
    }
    return record;
  }
  #installRecord(record) {
    let family = this.#families.get(record.rulesetId);
    if (!family) {
      family = {id: record.rulesetId, versions: new Map()};
      this.#families.set(record.rulesetId, family);
    }
    family.versions.set(record.versionId, copyJSON(record));
    this.#versionFamily.set(record.versionId, record.rulesetId);
  }
  create(data) {
    if (!isRecord(data)) throw new TypeError("Ruleset data must be an object.");
    const input = copyJSON(data);
    const requestedVersionId = input.versionId;
    delete input.versionId;
    const ruleset = createRulesetData(input);
    assertValidRulesetSchema(ruleset);
    const versionId = requestedVersionId ?? createStableId();
    if (typeof versionId !== "string" || !versionId.trim()) throw new Error("versionId must be a non-empty string.");
    if (this.#versionFamily.has(versionId)) throw new Error(`RulesetVersion already exists: ${versionId}.`);
    const family = this.#families.get(ruleset.id);
    if (family && Array.from(family.versions.values()).some(v => v.version === ruleset.version)) {
      throw new Error(`Ruleset version already exists in family ${ruleset.id}: ${ruleset.version}.`);
    }
    const record = {versionId, rulesetId: ruleset.id, version: ruleset.version, status: "draft",
      workingDraft: ruleset, publishedSnapshot: null};
    this.#installRecord(record);
    return copyJSON(record);
  }
  update(versionId, patch) {
    const record = this.#requireMutable(versionId);
    const current = record.workingDraft;
    if (!isRecord(patch)) throw new TypeError("Ruleset patch must be an object.");
    const input = copyJSON(patch);
    if (Object.hasOwn(input, "id") && input.id !== record.rulesetId) throw new Error("Ruleset id is immutable.");
    for (const key of ["revision", "status", "engineContractVersion"]) {
      if (Object.hasOwn(input, key) && input[key] !== current[key]) throw new Error(`${key} is managed by the Core.`);
    }
    const next = {...current, ...input};
    if (next.version !== current.version && record.publishedSnapshot) throw new Error("Ruleset version is immutable after first publication; use Create New Version after validation.");
    if (next.version !== current.version) {
      const family = this.#families.get(record.rulesetId);
      if (Array.from(family.versions.values()).some(v => v.versionId !== versionId && v.version === next.version)) throw new Error(`Ruleset version already exists in family ${record.rulesetId}: ${next.version}.`);
    }
    const index = new DependencyIndex(next);
    const protectedKinds = {definitions:"definition", parameters:"parameter", formulas:"formula", formulaBindings:"formulaBinding", conditions:"condition", rolls:"roll", outcomes:"outcome", tests:"test", effects:"effect", actions:"action", permissionPolicies:"permissionPolicy", eventTypes:"eventType", triggers:"trigger", contentTypes:"contentType", contentTemplates:"contentTemplate", modifiers:"modifier", restrictions:"restriction", durations:"duration", creationSystems:"creationSystem", progressionSystems:"progressionSystem", sheetDefinitions:"sheetDefinition"};
    for (const [collection, kind] of Object.entries(protectedKinds)) {
      for (const previous of current[collection] ?? []) {
        if (!(next[collection] ?? []).some(entry => entry?.id === previous.id)) {
          const consumers = index.getConsumers(previous.id, kind);
          if (consumers.length) throwIntegrityError(kind, previous.id, consumers);
        }
      }
    }
    for (const previous of current.definitionTypes ?? []) {
      if (!(next.definitionTypes ?? []).some(entry => entry?.id === previous.id)) {
        const consumers = (next.definitions ?? []).filter(entry => entry?.definitionTypeId === previous.id).map(entry => ({source:entry.id,path:"definitionTypeId"}));
        if (consumers.length) throwIntegrityError("definitionType", previous.id, consumers);
      }
    }
    assertValidRulesetSchema(next);
    if (JSON.stringify(next) !== JSON.stringify(current)) next.status = "draft";
    record.version = next.version; record.status = next.status; record.workingDraft = next;
    return copyJSON(next);
  }
  delete(versionId) {
    const record = this.#requireRecord(versionId);
    if (versionId === this.#activeVersionId) {
      const error = new Error(`Cannot delete active RulesetVersion: ${versionId}. Deactivate it first.`);
      error.code = "ACTIVE_VERSION";
      throw error;
    }
    // Validated means content-immutable, not undeletable. Deleting an inactive
    // version is an explicit lifecycle operation and never mutates its contents.
    const family = this.#families.get(record.rulesetId);
    family.versions.delete(versionId);
    this.#versionFamily.delete(versionId);
    deleteVersionWorldOverrides(this.#worldLocalizations, versionId);
    if (family.versions.size === 0) this.#families.delete(record.rulesetId);
    return true;
  }
  publish(versionId) {
    const record = this.#requireMutable(versionId);
    const current = record.workingDraft;
    assertValidRuleset(current);
    const revision = Math.max(current.revision, record.publishedSnapshot?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error("Ruleset revision limit reached.");
    const next = {...copyJSON(current), revision, status: "ready"};
    record.version = next.version;
    record.status = "ready";
    record.publishedSnapshot = copyJSON(next);
    record.workingDraft = copyJSON(next);
    return copyJSON(next);
  }
  validateVersion(versionId) {
    const record = this.#requireMutable(versionId);
    if (record.status !== "ready" || !record.publishedSnapshot) {
      throw new Error("Only a READY published RulesetVersion can be validated.");
    }
    const frozen = {...copyJSON(record.publishedSnapshot), status: "validated"};
    assertValidRuleset(frozen);
    record.status = "validated";
    record.workingDraft = copyJSON(frozen);
    record.publishedSnapshot = copyJSON(frozen);
    return copyJSON(record);
  }
  createNewVersion(sourceVersionId, version, {versionId = createStableId()} = {}) {
    const source = this.#requireRecord(sourceVersionId);
    if (source.status !== "validated" || !source.publishedSnapshot) throw new Error("Create New Version requires a validated source version.");
    if (typeof version !== "string" || !version.trim()) throw new Error("version must be a non-empty string.");
    if (this.#versionFamily.has(versionId)) throw new Error(`RulesetVersion already exists: ${versionId}.`);
    const family = this.#families.get(source.rulesetId);
    if (Array.from(family.versions.values()).some(v => v.version === version)) throw new Error(`Ruleset version already exists in family ${source.rulesetId}: ${version}.`);
    const workingDraft = {...copyJSON(source.publishedSnapshot), version, revision: 0, status: "draft"};
    const record = {versionId, rulesetId: source.rulesetId, version, status: "draft", workingDraft, publishedSnapshot: null};
    this.#installRecord(record);
    copyVersionWorldOverrides(this.#worldLocalizations, sourceVersionId, versionId);
    return copyJSON(record);
  }
  import(record, mode, worldLocalizations = undefined) {
    const next = copyJSON(record);
    if (!isRecord(next) || typeof next.versionId !== "string" || typeof next.rulesetId !== "string") throw new Error("Invalid RulesetVersion import.");
    assertValidRulesetSchema(next.workingDraft);
    if (next.publishedSnapshot !== null) assertValidRuleset(next.publishedSnapshot);
    if (!["NEW", "REPLACE"].includes(mode)) throw new Error(`Unsupported import mode: ${mode}.`);
    const existing = this.getRecord(next.versionId);
    if (mode === "NEW" && existing) throw new Error(`RulesetVersion already exists: ${next.versionId}.`);
    if (mode === "REPLACE" && !existing) throw new Error(`RulesetVersion not found: ${next.versionId}.`);
    if (existing && existing.rulesetId !== next.rulesetId) throw new Error("Cannot replace a RulesetVersion in another family.");
    // A Validated version is immutable, including through REPLACE.
    if (mode === "REPLACE") this.#requireMutable(next.versionId);
    const family = this.#families.get(next.rulesetId);
    if (family && Array.from(family.versions.values()).some(v => v.versionId !== next.versionId && v.version === next.version)) {
      throw new Error(`Ruleset version already exists in family ${next.rulesetId}: ${next.version}.`);
    }
    this.#installRecord(next);
    if (worldLocalizations !== undefined) this.#worldLocalizations[next.versionId] = copyJSON(worldLocalizations);
    else if (mode === "NEW") deleteVersionWorldOverrides(this.#worldLocalizations, next.versionId);
    return copyJSON(next);
  }
}

export function throwIntegrityError(kind, id, consumers) {
  const error = new Error(`Cannot delete ${kind} ${id}: still referenced.`);
  error.code = "REFERENTIAL_INTEGRITY";
  error.target = {kind, id};
  error.consumers = copyJSON(consumers);
  throw error;
}
