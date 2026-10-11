import {copyJSON} from "../src/configurator/configurator-schema.mjs";
import {emptyStorageSnapshot} from "../src/configurator/configurator-storage.mjs";

export class FakeStorage {
  listeners = new Set();
  saves = [];
  constructor(snapshot = emptyStorageSnapshot()) { this.snapshot = copyJSON(snapshot); }
  async load() { return copyJSON(this.snapshot); }
  async save(snapshot) {
    if (this.failure) throw this.failure;
    this.snapshot = copyJSON(snapshot);
    this.saves.push(copyJSON(snapshot));
    this.emit(snapshot);
  }
  emit(snapshot) {
    for (const listener of this.listeners) listener(copyJSON(snapshot));
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
