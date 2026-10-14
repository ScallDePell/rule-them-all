const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Portable ID generation. Uses Web Crypto when available; no randomUUID dependency. */
export function createStableId(length = 16) {
  if (!Number.isSafeInteger(length) || length < 8) throw new TypeError("ID length must be an integer >= 8.");
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/** A readable id from a name: lower case, accents stripped, words joined by "-". */
export const readableId = value => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** `base`, or `base-2`, `base-3`… when it is already taken. */
export const freeId = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };
