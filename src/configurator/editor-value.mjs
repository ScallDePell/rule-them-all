import {validateTypedValue} from "./value-type-registry.mjs";

/** UI-only conversion helpers for CP-22 FieldDefinition editors. */
export function formatEditorValue(valueType, cardinality, value) {
  if (value === undefined || value === null) return value === null ? "null" : "";
  if (cardinality === "many") {
    if (!Array.isArray(value)) return "";
    return value.map(entry => typeof entry === "object" && entry !== null ? JSON.stringify(entry) : String(entry)).join("\n");
  }
  if (valueType === "reference" || valueType === "duration") return JSON.stringify(value);
  if (valueType === "boolean") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

export function parseEditorValue(valueType, cardinality, nullable, raw, {allowBlankString = true} = {}) {
  const text = String(raw ?? "");
  if (cardinality === "many") {
    const lines = text.split(/\r?\n/).map(value => value.trim()).filter(value => value.length > 0);
    if (valueType === "string") return lines;
    if (valueType === "integer") return lines.map((value, index) => {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error(`Line ${index + 1} must be an integer.`);
      return number;
    });
    if (valueType === "number") return lines.map((value, index) => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error(`Line ${index + 1} must be a number.`);
      return number;
    });
    if (valueType === "boolean") return lines.map((value, index) => {
      if (value === "true") return true;
      if (value === "false") return false;
      throw new Error(`Line ${index + 1} must be true or false.`);
    });
    if (["reference", "duration"].includes(valueType)) return lines.map((line,index) => {
      let parsed;
      try { parsed=JSON.parse(line); } catch { throw new Error(`Line ${index+1} must contain valid JSON.`); }
      if(!validateTypedValue(valueType,"one",false,parsed).valid)throw new Error(`Line ${index+1} is not a valid ${valueType}.`);
      return parsed;
    });
    throw new Error(`Unsupported editor value type: ${valueType}.`);
  }

  const trimmed = text.trim();
  if (trimmed === "null" && nullable) return null;
  if (valueType === "string") {
    if (!allowBlankString && text.length === 0) throw new Error("A string value is required.");
    return text;
  }
  if (trimmed.length === 0) {
    if (nullable) return null;
    throw new Error("A value is required.");
  }
  if (valueType === "integer") {
    const number = Number(trimmed);
    if (!Number.isSafeInteger(number)) throw new Error("Value must be an integer.");
    return number;
  }
  if (valueType === "number") {
    const number = Number(trimmed);
    if (!Number.isFinite(number)) throw new Error("Value must be a number.");
    return number;
  }
  if (valueType === "boolean") {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    throw new Error("Value must be true or false.");
  }
  if (["reference", "duration"].includes(valueType)) {
    let parsed;
    try { parsed=JSON.parse(trimmed); } catch { throw new Error("Value must contain valid JSON."); }
    if(!validateTypedValue(valueType,"one",nullable,parsed).valid)throw new Error(`Value is not a valid ${valueType}.`);
    return parsed;
  }
  throw new Error(`Unsupported editor value type: ${valueType}.`);
}
