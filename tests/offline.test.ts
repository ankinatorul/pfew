import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  encryptSnapshot,
  decryptSnapshot,
  saveSnapshot,
  listSnapshots,
  removeSnapshot,
  encodeDocument,
  decodeDocument,
} from "../public/offline-store.js";
it("stores only authenticated ciphertext, requires the passphrase and removes saved copies", async () => {
  const snapshot = {
    trip: { name: "PRIVATE HOLIDAY" },
    bookings: [{ reference: "SECRET REFERENCE" }],
    documents: [{ data: "VERY PRIVATE DOCUMENT" }],
  };
  const encrypted = await encryptSnapshot(
    snapshot,
    "a long private passphrase",
  );
  expect(JSON.stringify(encrypted)).not.toContain("PRIVATE");
  expect(await decryptSnapshot(encrypted, "a long private passphrase")).toEqual(
    snapshot,
  );
  await expect(
    decryptSnapshot(encrypted, "wrong passphrase"),
  ).rejects.toThrow();
  const changed = {
    ...encrypted,
    ciphertext:
      (encrypted.ciphertext.startsWith("A") ? "B" : "A") +
      encrypted.ciphertext.slice(1),
  };
  await expect(
    decryptSnapshot(changed, "a long private passphrase"),
  ).rejects.toThrow();
  await saveSnapshot("user", "trip", encrypted);
  const rows = await listSnapshots();
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE");
  expect(Object.keys(rows[0]).sort()).toEqual(["envelope", "id", "savedAt"]);
  await saveSnapshot("user", "trip", encrypted);
  expect(await listSnapshots()).toHaveLength(1);
  await removeSnapshot("user:trip");
  expect(await listSnapshots()).toHaveLength(0);
  await expect(encryptSnapshot(snapshot, "short")).rejects.toThrow("10");
});
it("round-trips a full size document without corrupting bytes", async () => {
  const bytes = new Uint8Array(3145728);
  bytes[0] = 255;
  bytes[3145727] = 128;
  const encoded = await encodeDocument(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const decoded = new Uint8Array(
    await decodeDocument(encoded, "application/pdf").arrayBuffer(),
  );
  expect(Buffer.from(decoded).equals(Buffer.from(bytes))).toBe(true);
});
