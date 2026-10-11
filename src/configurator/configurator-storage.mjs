import {copyJSON, isRecord, normalizeRulesetCollections} from "./configurator-schema.mjs";
import {assertValidRuleset} from "./configurator-validation.mjs";
import {validateWorldLocalizations} from "./world-localization.mjs";

export const emptyStorageSnapshot = () => ({
  storageVersion: 3, storageRevision: 0, activeVersionId: null, rulesetFamilies: [], worldLocalizations: {}
});

/** Compare JSON content independently of object insertion order. Array order matters. */
export function storageFingerprint(value) {
  if (Array.isArray(value)) return `[${value.map(storageFingerprint).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${storageFingerprint(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const exactKeys = (data, expected) => isRecord(data)
  && Object.keys(data).sort().join() === [...expected].sort().join();
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

export function validateVersionRecord(record, familyId) {
  record.workingDraft = normalizeRulesetCollections(record.workingDraft);
  if (record.publishedSnapshot !== null) record.publishedSnapshot = normalizeRulesetCollections(record.publishedSnapshot);
  if (!exactKeys(record, ["versionId", "rulesetId", "version", "status", "workingDraft", "publishedSnapshot"])) {
    throw new Error("Invalid stored RulesetVersionRecord.");
  }
  if (!nonEmpty(record.versionId) || !nonEmpty(record.rulesetId) || record.rulesetId !== familyId) {
    throw new Error("Invalid RulesetVersion identity.");
  }
  if (!nonEmpty(record.version) || !["draft", "ready", "validated"].includes(record.status)) {
    throw new Error("Invalid RulesetVersion metadata.");
  }
  assertValidRuleset(record.workingDraft);
  if (record.workingDraft.id !== familyId || record.workingDraft.version !== record.version || record.workingDraft.status !== record.status) {
    throw new Error("RulesetVersion working draft metadata mismatch.");
  }
  if (record.publishedSnapshot !== null) {
    assertValidRuleset(record.publishedSnapshot, {scope: "publish"});
    if (record.publishedSnapshot.id !== familyId || record.publishedSnapshot.version !== record.version
      || !["ready", "validated"].includes(record.publishedSnapshot.status)) {
      throw new Error("Invalid stored publication.");
    }
  }
  if (record.status === "ready") {
    if (record.publishedSnapshot === null || storageFingerprint(record.workingDraft) !== storageFingerprint(record.publishedSnapshot)) {
      throw new Error("Ready working copy must match its publication.");
    }
  }
  if (record.status === "validated") {
    if (record.publishedSnapshot === null || storageFingerprint(record.workingDraft) !== storageFingerprint(record.publishedSnapshot)) {
      throw new Error("Validated version must match its frozen publication.");
    }
  }
  return record;
}

/** Strict clean-foundation envelope. No migration or reader for storageVersion 2 and earlier. */
export function readStorageSnapshot(value) {
  const snapshot = copyJSON(value);
  if (!exactKeys(snapshot, ["storageVersion", "storageRevision", "activeVersionId", "rulesetFamilies", "worldLocalizations"])) {
    throw new Error("Invalid configurator storage envelope.");
  }
  if (snapshot.storageVersion !== 3) throw new Error("Unsupported configurator storageVersion.");
  if (!Number.isSafeInteger(snapshot.storageRevision) || snapshot.storageRevision < 0) {
    throw new Error("Invalid configurator storageRevision.");
  }
  if (!Array.isArray(snapshot.rulesetFamilies) || !isRecord(snapshot.worldLocalizations)) {
    throw new Error("Invalid configurator storage collections.");
  }
  const familyIds = new Set(), versionIds = new Set();
  for (const family of snapshot.rulesetFamilies) {
    if (!exactKeys(family, ["id", "versions"]) || !nonEmpty(family.id) || !Array.isArray(family.versions)) {
      throw new Error("Invalid stored RulesetFamily.");
    }
    if (familyIds.has(family.id)) throw new Error("Duplicate stored RulesetFamily id.");
    familyIds.add(family.id);
    for (const record of family.versions) {
      validateVersionRecord(record, family.id);
      if (versionIds.has(record.versionId)) throw new Error("Duplicate stored versionId.");
      versionIds.add(record.versionId);
    }
  }
  validateWorldLocalizations(snapshot.worldLocalizations, versionIds);
  if (snapshot.activeVersionId !== null) {
    if (!versionIds.has(snapshot.activeVersionId)) throw new Error("Active RulesetVersion is absent from storage.");
    const record = snapshot.rulesetFamilies.flatMap(f => f.versions).find(v => v.versionId === snapshot.activeVersionId);
    if (!record?.publishedSnapshot) throw new Error("Active RulesetVersion has no published snapshot.");
  }
  return snapshot;
}

export function storageConflict(expectedRevision, actualRevision) {
  const error = new Error(`Configurator storage conflict: expected ${expectedRevision}, received ${actualRevision}.`);
  Object.assign(error, {code: "STORAGE_CONFLICT", expectedRevision, actualRevision});
  return error;
}
