/** Data read from Foundry (a Document's toObject(), its flags, a world setting) as plain JSON.
   Foundry may hand back objects with accessors, non-enumerable or symbol keys, or class instances, which
   copyJSON rightly refuses ("Expected enumerable JSON properties without accessors"): every value the
   module reads from Foundry crosses this boundary first. */
export function foundryJSON(value) {
  if (value === undefined || value === null) return value ?? null;
  return JSON.parse(JSON.stringify(value));
}
