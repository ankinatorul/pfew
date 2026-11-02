export const MAX_FILE_SIZE = 3 * 1024 * 1024;
export function validFileType(bytes: Uint8Array, type: string) {
  if (type === "application/pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}
export function safeFilename(value: string) {
  return (
    value.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 200) ||
    "booking-document"
  );
}
