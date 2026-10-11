import {copyJSON, isRecord} from "./configurator-schema.mjs";
import {assertValidRuleset} from "./configurator-validation.mjs";
import {throwIntegrityError} from "./configurator-registry.mjs";
import {capabilityTypeRegistry, resolveFieldContract} from "./capability-type-registry.mjs";
import {prepareFieldMap, applyFieldContract} from "./field-output-contracts.mjs";

/** Collection CRUD over the Ruleset aggregate; never owns a separate store. */
export const nextOrder = entries => entries.reduce((max, entry) => Math.max(max, Number.isFinite(entry?.order) ? entry.order : 0), 0) + 10;

export class RulesetCollectionRegistry {
  #registry;
  #collection;
  #defaults;
  #immutable;

  constructor(registry, collection, defaults, immutable = ["id"]) {
    this.#registry = registry;
    this.#collection = collection;
    this.#defaults = defaults;
    this.#immutable = immutable;
  }

  get collectionName() { return this.#collection; }
  ruleset(id) {
    const ruleset = this.#registry.get(id);
    if (!ruleset) throw new Error(`Ruleset not found: ${id}.`);
    return ruleset;
  }
  list(rulesetId) { return this.ruleset(rulesetId)[this.#collection] ?? []; }
  prepareEntry(data, _ruleset) { return data; }
  get(rulesetId, id) { return this.list(rulesetId).find(data => data.id === id); }
  #require(rulesetId, id) {
    const entry = this.get(rulesetId, id);
    if (!entry) throw new Error(`${this.#collection} entry not found: ${id}.`);
    return entry;
  }
  #commit(versionId, ruleset, collection) {
    const next = {...ruleset, [this.#collection]: collection};
    assertValidRuleset(next);
    this.#registry.update(versionId, {[this.#collection]: collection});
  }
  create(rulesetId, data) {
    if (!isRecord(data)) throw new TypeError("Collection entry must be a plain object.");
    const ruleset = this.ruleset(rulesetId);
    const collection = ruleset[this.#collection] ?? [];
    // A new entry goes after the existing ones (10, 20, 30...) unless it names its order.
    const placed = Object.hasOwn(data, "order") ? {} : {order: nextOrder(collection)};
    const next = this.prepareEntry({...copyJSON(this.#defaults), ...placed, ...copyJSON(data)}, ruleset);
    if (collection.some(entry => entry.id === next.id)) throw new Error(`Entry already exists: ${next.id}.`);
    this.#commit(rulesetId, ruleset, [...collection, next]);
    return copyJSON(next);
  }
  update(rulesetId, id, patch) {
    if (!isRecord(patch)) throw new TypeError("Collection patch must be a plain object.");
    const input = copyJSON(patch);
    const current = this.#require(rulesetId, id);
    for (const key of this.#immutable) {
      if (Object.hasOwn(input, key) && input[key] !== current[key]) throw new Error(`${key} is immutable.`);
    }
    const ruleset = this.ruleset(rulesetId);
    const next = this.prepareEntry({...current, ...input}, ruleset);
    const collection = ruleset[this.#collection].map(entry => entry.id === id ? next : entry);
    this.#commit(rulesetId, ruleset, collection);
    return copyJSON(next);
  }
  delete(rulesetId, id) {
    this.#require(rulesetId, id);
    const ruleset = this.ruleset(rulesetId);
    this.#commit(rulesetId, ruleset, ruleset[this.#collection].filter(entry => entry.id !== id));
    return true;
  }
}

export class DefinitionTypeRegistry extends RulesetCollectionRegistry {
  constructor(registry) {
    super(registry, "definitionTypes", {
      descriptionKey: "", color: null, enabled: true, order: 0, allowedCapabilities: [], defaultCapabilities: [], requiredCapabilities: [], fields: {}, constraints: []
    }, ["id","key"]);
  }
  prepareEntry(data) {
    const next = copyJSON(data);
    next.fields = prepareFieldMap(next.fields ?? {});
    for (const key of ["allowedCapabilities","defaultCapabilities","requiredCapabilities"]) {
      if (!Array.isArray(next[key])) throw new TypeError(`${key} must be an array.`);
      if (new Set(next[key]).size !== next[key].length) throw new Error(`${key} contains duplicate CapabilityType ids.`);
      for (const id of next[key]) if (!capabilityTypeRegistry.has(id)) throw new Error(`Unknown CapabilityType: ${id}.`);
    }
    // Resolve all allowed capability fields now so collisions are rejected at type authoring time.
    resolveFieldContract(next, next.allowedCapabilities);
    return next;
  }
  delete(rulesetId, id) {
    const ruleset = this.ruleset(rulesetId);
    const consumers = ruleset.definitions.flatMap((data, index) => data.definitionTypeId === id
      ? [{source: data.id, path: `definitions[${index}].type`}] : []);
    if (consumers.length) throwIntegrityError("definitionType", id, consumers);
    return super.delete(rulesetId, id);
  }
}
