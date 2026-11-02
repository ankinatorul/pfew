// Shared by the online download screen and standalone offline reader.
// Only ciphertext and opaque identifiers are written to IndexedDB.
const DB = "pfew-offline-v1",
  STORE = "snapshots",
  ITERATIONS = 210000;
const encoder = new TextEncoder();
function base64(bytes) {
  let value = "";
  for (let start = 0; start < bytes.length; start += 8192)
    value += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(value);
}
function unbase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
async function keyFor(passphrase, salt, usage) {
  if (passphrase.length < 10 || passphrase.length > 1000)
    throw new Error("Use a passphrase of 10 to 1000 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}
export async function encryptSnapshot(snapshot, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt, "encrypt");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(snapshot)),
  );
  return {
    version: 1,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(encrypted)),
  };
}
export async function decryptSnapshot(envelope, passphrase) {
  if (envelope.version !== 1) throw new Error("Unsupported download version.");
  const salt = unbase64(envelope.salt),
    iv = unbase64(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw new Error("Invalid encrypted download.");
  const key = await keyFor(passphrase, salt, "decrypt");
  const decoded = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    unbase64(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decoded));
}
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Offline storage is unavailable in this browser."));
  });
}
async function requestStore(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode),
        request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(
          transaction.error || new Error("Could not save offline download."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error || new Error("Offline storage was interrupted."),
        );
    });
  } finally {
    db.close();
  }
}
export async function saveSnapshot(userId, tripId, envelope) {
  await requestStore("readwrite", (store) =>
    store.put({
      id: userId + ":" + tripId,
      savedAt: new Date().toISOString(),
      envelope,
    }),
  );
}
export async function listSnapshots() {
  return requestStore("readonly", (store) => store.getAll());
}
export async function removeSnapshot(id) {
  await requestStore("readwrite", (store) => store.delete(id));
}
export async function encodeDocument(blob) {
  return base64(new Uint8Array(await blob.arrayBuffer()));
}
export function decodeDocument(value, type) {
  return new Blob([unbase64(value)], { type });
}
