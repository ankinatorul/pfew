import { PDFDocument } from "pdf-lib";
import { imageSize } from "image-size";
import { MAX_FILE_SIZE, validFileType } from "./files";
import type { ImportDocument } from "./booking-extraction";
export async function importDocument(file: File): Promise<ImportDocument> {
  if (!file.size || file.size > MAX_FILE_SIZE)
    throw new Error("Choose a PDF, JPEG or PNG no larger than 3 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validFileType(bytes, file.type))
    throw new Error("File contents must match PDF, JPEG or PNG.");
  if (file.type === "application/pdf") {
    let pages: number;
    try {
      pages = (
        await PDFDocument.load(bytes, { updateMetadata: false })
      ).getPageCount();
    } catch {
      throw new Error(
        "This PDF could not be read. Use an unencrypted PDF or paste its text.",
      );
    }
    if (pages < 1 || pages > 5)
      throw new Error("Import up to five PDF pages at a time.");
  } else {
    let size: ReturnType<typeof imageSize>;
    try {
      size = imageSize(bytes);
    } catch {
      throw new Error("This image could not be read.");
    }
    if (!size.width || !size.height || size.width * size.height > 20000000)
      throw new Error("Choose an image no larger than 20 megapixels.");
  }
  return {
    mime: file.type as ImportDocument["mime"],
    base64: Buffer.from(bytes).toString("base64"),
  };
}
