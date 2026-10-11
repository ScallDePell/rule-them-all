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
