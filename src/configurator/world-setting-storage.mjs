import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {readStorageSnapshot, storageConflict, storageFingerprint} from "./configurator-storage.mjs";

export const STORAGE_NAMESPACE = "rule-them-all";
/** The index: revision, active version, families (their version ids) and World translations. */
export const STORAGE_KEY = "configuratorStorage";
/** One world setting per RulesetVersion record, so a save only sends the versions it changed. */
export const VERSION_KEY_PREFIX = "rulesetVersion.";
export const SPLIT_STORAGE_VERSION = 4;
export const emptyStorageIndex = () => ({storageVersion: SPLIT_STORAGE_VERSION, storageRevision: 0, activeVersionId: null, rulesetFamilies: [], worldLocalizations: {}});
export const versionSettingKey = versionId => `${VERSION_KEY_PREFIX}${versionId}`;

/** The stored index of a snapshot: its records replaced by their version ids. */
export function storageIndex(snapshot) {
  return {storageVersion: SPLIT_STORAGE_VERSION, storageRevision: snapshot.storageRevision, activeVersionId: snapshot.activeVersionId,
    rulesetFamilies: snapshot.rulesetFamilies.map(family => ({id: family.id, versionIds: family.versions.map(record => record.versionId)})), worldLocalizations: snapshot.worldLocalizations};
}

/** The only persistence adapter which knows Foundry settings. The configurator sees one snapshot; Foundry stores an
   index and one setting per RulesetVersion. */
export class WorldSettingStorage {
  #settings;
  #listeners = new Set();
  #registered = new Set();
  /** versionId -> fingerprint of the record as stored, to write only what changed. */
  #stored = new Map();
  constructor(settings) { this.#settings = settings; }
  register() {
    this.#settings.register(STORAGE_NAMESPACE, STORAGE_KEY, {
      scope: "world", config: false, type: Object, default: emptyStorageIndex(),
      // The index is written last: when it changes, the versions it names are already stored.
      onChange: () => {
        let snapshot;
        try { snapshot = this.#assemble(); } catch (error) { console.error("Rule Them'All | Stored data unreadable", error); return; }
        for (const listener of this.#listeners) listener(copyJSON(snapshot));
      }
    });
  }
  #registerVersion(versionId) {
    const key = versionSettingKey(versionId);
    if (this.#registered.has(key)) return key;
    this.#settings.register(STORAGE_NAMESPACE, key, {scope: "world", config: false, type: Object, default: null});
    this.#registered.add(key);
    return key;
  }
  #index() {
    const index = this.#settings.get(STORAGE_NAMESPACE, STORAGE_KEY);
    if (!isRecord(index) || index.storageVersion !== SPLIT_STORAGE_VERSION || !Array.isArray(index.rulesetFamilies)) {
      throw new Error("Rule Them'All data is in a former storage format: repair it once (Game Settings > Rule Them'All > Repair the data).");
    }
    return index;
  }
  #assemble() {
    const index = this.#index(), stored = new Map();
    const rulesetFamilies = index.rulesetFamilies.map(family => ({id: family.id, versions: family.versionIds.map(versionId => {
      const record = this.#settings.get(STORAGE_NAMESPACE, this.#registerVersion(versionId));
      if (!isRecord(record)) throw new Error(`Rule Them'All: the stored RulesetVersion ${versionId} is missing.`);
      stored.set(versionId, storageFingerprint(record));
      return record;
    })}));
    this.#stored = stored;
    return {storageVersion: 3, storageRevision: index.storageRevision, activeVersionId: index.activeVersionId, rulesetFamilies, worldLocalizations: index.worldLocalizations ?? {}};
  }
  async load() { return copyJSON(this.#assemble()); }
  async save(value, {force = false} = {}) {
    // CP-11: configuring a Ruleset is a GM operation, whatever Foundry lets the role write.
    if (!globalThis.game?.user?.isGM) throw new Error("Only a GM can configure Rule Them'All.");
    const snapshot = readStorageSnapshot(value);
    const raw = this.#settings.get(STORAGE_NAMESPACE, STORAGE_KEY);
    const current = force && raw?.storageVersion !== SPLIT_STORAGE_VERSION ? emptyStorageIndex() : this.#index();
    if (!force && current.storageRevision !== snapshot.storageRevision - 1) {
      throw storageConflict(snapshot.storageRevision - 1, current.storageRevision);
    }
    // This local check is not a server-side compare-and-swap.
    const kept = new Set();
    for (const record of snapshot.rulesetFamilies.flatMap(family => family.versions)) {
      kept.add(record.versionId);
      const fingerprint = storageFingerprint(record);
      if (this.#stored.get(record.versionId) === fingerprint) continue;
      await this.#settings.set(STORAGE_NAMESPACE, this.#registerVersion(record.versionId), record);
      this.#stored.set(record.versionId, fingerprint);
    }
    await this.#settings.set(STORAGE_NAMESPACE, STORAGE_KEY, storageIndex(snapshot));
    // A deleted version's setting is emptied once the index no longer names it.
    for (const family of current.rulesetFamilies) for (const versionId of family.versionIds) {
      if (kept.has(versionId)) continue;
      await this.#settings.set(STORAGE_NAMESPACE, this.#registerVersion(versionId), null);
      this.#stored.delete(versionId);
    }
  }
  /** The data repair only (stored-data-repair.mjs): writes every version and the index, whatever was stored before. */
  async replace(value) {
    if (!globalThis.game?.user?.isGM) throw new Error("Only a GM can configure Rule Them'All.");
    const snapshot = readStorageSnapshot(value);
    this.#stored = new Map();
    await this.save(snapshot, {force: true});
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
