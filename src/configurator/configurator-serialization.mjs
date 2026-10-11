import {RULESET_PACKAGE_FORMAT, LEGACY_RULESET_PACKAGE_FORMAT, RULESET_PACKAGE_FORMAT_VERSION, RULESET_PACKAGE_FORMATS} from "../core/module-contract.mjs";
import {copyJSON, ENGINE_CONTRACT_VERSION, isRecord, normalizeRulesetCollections} from "./configurator-schema.mjs";
import {assertValidRuleset, assertValidRulesetSchema} from "./configurator-validation.mjs";
import {storageFingerprint} from "./configurator-storage.mjs";
import {validateWorldLocalizations} from "./world-localization.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function validateVersionRecord(record) {
  record.workingDraft = normalizeRulesetCollections(record.workingDraft);
  if (record.publishedSnapshot !== null) record.publishedSnapshot = normalizeRulesetCollections(record.publishedSnapshot);
  if (!isRecord(record)) throw new Error("Invalid RulesetVersion package record.");
  const keys = ["versionId", "rulesetId", "version", "status", "workingDraft", "publishedSnapshot"];
  if (Object.keys(record).sort().join() !== keys.sort().join()) throw new Error("Unsupported RulesetVersion package field.");
  for (const key of ["versionId", "rulesetId", "version"]) {
    if (typeof record[key] !== "string" || !record[key].trim()) throw new Error(`Invalid RulesetVersion ${key}.`);
  }
  if (!["draft", "ready", "validated"].includes(record.status)) throw new Error("Invalid RulesetVersion status.");
  assertValidRuleset(record.workingDraft);
  if (record.workingDraft.id !== record.rulesetId || record.workingDraft.version !== record.version || record.workingDraft.status !== record.status) {
    throw new Error("RulesetVersion working draft metadata mismatch.");
  }
  if (record.publishedSnapshot !== null) {
    assertValidRuleset(record.publishedSnapshot);
    if (record.publishedSnapshot.id !== record.rulesetId || record.publishedSnapshot.version !== record.version
      || !["ready", "validated"].includes(record.publishedSnapshot.status)) throw new Error("Invalid RulesetVersion publication.");
  }
  if (["ready", "validated"].includes(record.status)) {
    if (record.publishedSnapshot === null || storageFingerprint(record.workingDraft) !== storageFingerprint(record.publishedSnapshot)) {
      throw new Error("Published RulesetVersion must match its current published state.");
    }
  }
  return record;
}

export function exportRulesetData(record, {worldLocalizations, format=LEGACY_RULESET_PACKAGE_FORMAT} = {}) {
  if(!RULESET_PACKAGE_FORMATS.includes(format))throw new Error("Unsupported Ruleset package format.");
  const versionRecord = validateVersionRecord(copyJSON(record));
  const data = {
    format, formatVersion: RULESET_PACKAGE_FORMAT_VERSION, engineContractVersion: ENGINE_CONTRACT_VERSION,
    rulesetId: versionRecord.rulesetId, versionId: versionRecord.versionId, version: versionRecord.version,
    versionRecord
  };
  if (worldLocalizations !== undefined) {
    const wrapped = {[versionRecord.versionId]: copyJSON(worldLocalizations)};
    validateWorldLocalizations(wrapped, new Set([versionRecord.versionId]));
    data.worldLocalizations = wrapped[versionRecord.versionId];
  }
  return canonical(data);
}

export function readRulesetPayload(payload) {
  const data = copyJSON(typeof payload === "string" ? JSON.parse(payload) : payload);
  if (!isRecord(data) || !RULESET_PACKAGE_FORMATS.includes(data.format) || data.formatVersion !== RULESET_PACKAGE_FORMAT_VERSION) {
    throw new Error("Unsupported Ruleset package format.");
  }
  const allowed = ["format", "formatVersion", "engineContractVersion", "rulesetId", "versionId", "version", "versionRecord", "worldLocalizations"];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error("Unsupported Ruleset package field.");
  if (data.engineContractVersion !== ENGINE_CONTRACT_VERSION) throw new Error("Unsupported engine contract version.");
  const record = validateVersionRecord(data.versionRecord);
  if (data.rulesetId !== record.rulesetId || data.versionId !== record.versionId || data.version !== record.version) {
    throw new Error("Ruleset package identity mismatch.");
  }
  let worldLocalizations;
  if (Object.hasOwn(data, "worldLocalizations")) {
    const wrapped = {[record.versionId]: data.worldLocalizations};
    validateWorldLocalizations(wrapped, new Set([record.versionId]));
    worldLocalizations = copyJSON(data.worldLocalizations);
  }
  return {record, worldLocalizations};
}
