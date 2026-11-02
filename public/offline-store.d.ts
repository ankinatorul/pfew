export type EncryptedSnapshot = {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
};
export function encryptSnapshot(
  snapshot: unknown,
  passphrase: string,
): Promise<EncryptedSnapshot>;
export function decryptSnapshot(
  envelope: EncryptedSnapshot,
  passphrase: string,
): Promise<unknown>;
export function saveSnapshot(
  userId: string,
  tripId: string,
  envelope: EncryptedSnapshot,
): Promise<void>;
export function listSnapshots(): Promise<
  { id: string; savedAt: string; envelope: EncryptedSnapshot }[]
>;
export function removeSnapshot(id: string): Promise<void>;
export function encodeDocument(blob: Blob): Promise<string>;
export function decodeDocument(value: string, type: string): Blob;
