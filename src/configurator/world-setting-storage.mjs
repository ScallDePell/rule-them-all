import {copyJSON} from "./configurator-schema.mjs";
import {emptyStorageSnapshot, readStorageSnapshot, storageConflict} from "./configurator-storage.mjs";

export const STORAGE_NAMESPACE = "rule-them-all";
export const STORAGE_KEY = "configuratorStorage";

/** The only persistence adapter which knows Foundry settings. */
export class WorldSettingStorage {
  #settings;
  #listeners = new Set();
  constructor(settings) { this.#settings = settings; }
  register() {
    this.#settings.register(STORAGE_NAMESPACE, STORAGE_KEY, {
      scope: "world", config: false, type: Object, default: emptyStorageSnapshot(),
      onChange: value => {
        for (const listener of this.#listeners) listener(value);
      }
    });
  }
  async load() { return copyJSON(this.#settings.get(STORAGE_NAMESPACE, STORAGE_KEY)); }
  async save(value) {
    const snapshot = readStorageSnapshot(value);
    const current = readStorageSnapshot(await this.load());
    if (current.storageRevision !== snapshot.storageRevision - 1) {
      throw storageConflict(snapshot.storageRevision - 1, current.storageRevision);
    }
    // This local check is not a server-side compare-and-swap.
    await this.#settings.set(STORAGE_NAMESPACE, STORAGE_KEY, snapshot);
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
