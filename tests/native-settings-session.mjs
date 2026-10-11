// A new session discards registration, document values and onChange observers.
// Only serialized setting values survive, as with Foundry ClientSettings.
export function nativeSettingsSession(persisted = new Map()) {
  const registrations = new Map();
  return {
    persisted,
    register(namespace, key, config) { registrations.set(`${namespace}.${key}`, config); },
    get(namespace, key) {
      const id = `${namespace}.${key}`;
      return persisted.has(id) ? JSON.parse(persisted.get(id)) : structuredClone(registrations.get(id).default);
    },
    async set(namespace, key, value) {
      if (this.failure) throw this.failure;
      const id = `${namespace}.${key}`;
      persisted.set(id, JSON.stringify(value));
      const stored = this.get(namespace, key);
      registrations.get(id).onChange?.(stored);
      return stored;
    }
  };
}
