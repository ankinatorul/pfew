import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import {
  extractLabeledText,
  liveBookingExtractor,
} from "../../../lib/booking-extraction";
import { importDocument } from "../../../lib/import-document";
import {
  ownedCollection,
  persistCollectionEntry,
} from "../../../lib/booking-collection-server";
import {
  mergeExtraction,
  type CollectionEntry,
} from "../../../lib/booking-collection";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function POST(request: Request) {
  const user = await currentGoogleUser();
  if (!user) return reply({ error: "Sign in required" }, 401);
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024)
    return reply({ error: "Import is too large." }, 413);
  const form = await request.formData().catch(() => null);
  if (!form)
    return reply(
      { error: "Choose booking text or a supported document." },
      400,
    );
  const parsed = z
    .object({
      trip_id: z.uuid(),
      mode: z.enum(["text", "ai"]),
      text: z.string().max(16000),
    })
    .safeParse({
      trip_id: form.get("trip_id"),
      mode: form.get("mode"),
      text: String(form.get("text") || ""),
    });
  if (!parsed.success)
    return reply(
      { error: "Choose a trip and paste up to 16,000 characters." },
      400,
    );
  const db = await supabase(),
    input = parsed.data;
  const { data: canEdit, error: permissionError } = await db.rpc(
    "can_edit_trip",
    { target: input.trip_id },
  );
  if (permissionError || !canEdit)
    return reply({ error: "Trip editing access is required." }, 403);
  let collectionEntry: CollectionEntry | undefined;
  const entryId = form.get("collection_entry_id");
  if (entryId) {
    if (!z.uuid().safeParse(entryId).success)
      return reply({ error: "Choose a saved collection entry." }, 400);
    try {
      const context = await ownedCollection(db, user.id, input.trip_id);
      collectionEntry = context.entries.find((entry) => entry.id === entryId);
      if (!collectionEntry || collectionEntry.removing)
        return reply({ error: "Saved booking entry unavailable." }, 404);
      if (collectionEntry.revision !== Number(form.get("revision")))
        return reply(
          {
            error:
              "This booking changed. Reload before reading its source again.",
          },
          409,
        );
    } catch {
      return reply(
        {
          error:
            "Private booking collection is unavailable. Nothing was changed.",
        },
        403,
      );
    }
  }
  async function extracted(
    result: Awaited<ReturnType<typeof extractLabeledText>>,
  ) {
    if (collectionEntry)
      collectionEntry = await persistCollectionEntry(
        db,
        input.trip_id,
        mergeExtraction(collectionEntry, result),
      );
    return reply({
      ...result,
      importKey: collectionEntry?.id || randomUUID(),
      ...(collectionEntry ? { entry: collectionEntry } : {}),
    });
  }
  try {
    if (input.mode === "text")
      return await extracted(extractLabeledText(input.text));
    if (form.get("consent") !== "yes")
      return reply(
        {
          error:
            "Choose whether to send this source to the AI provider before continuing.",
        },
        400,
      );
    const provider = liveBookingExtractor();
    let file = form.get("file");
    if (collectionEntry?.source) {
      const source = collectionEntry.source;
      const record = await db
        .from("booking_attachments")
        .select("path,state")
        .eq("id", source.attachment_id)
        .eq("owner_id", user.id)
        .eq("trip_id", input.trip_id)
        .eq("intake_id", collectionEntry.id)
        .single();
      if (record.error || record.data?.state !== "ready")
        throw new Error(
          "Confirm the stored upload before reading it. Your booking entry is still saved.",
        );
      const stored = await db.storage
        .from("booking-files")
        .download(record.data.path);
      if (stored.error || !stored.data)
        throw new Error(
          "Your stored file could not be opened. Retry the read; you do not need to upload it again.",
        );
      file = new File([await stored.data.arrayBuffer()], source.filename, {
        type: source.content_type,
      });
    }
    if (input.text.trim() && file instanceof File && file.size)
      return reply(
        { error: "Choose pasted text or one document, not both." },
        400,
      );
    const document =
      file instanceof File && file.size
        ? await importDocument(file)
        : undefined;
    if (!document && !input.text.trim())
      return reply({ error: "Paste booking text or choose a PDF/image." }, 400);
    const { data: reservation, error } = await db.rpc("reserve_service", {
      target: input.trip_id,
      kind: "ai",
    });
    if (error)
      return reply(
        { error: "AI request permission or budget unavailable." },
        429,
      );
    try {
      const result = await provider.extract({
        text: input.text.trim() || undefined,
        document,
      });
      await db.rpc("finish_service", { reservation, succeeded: true });
      return await extracted(result);
    } catch {
      await db.rpc("finish_service", { reservation, succeeded: false });
      if (collectionEntry) {
        try {
          collectionEntry = await persistCollectionEntry(db, input.trip_id, {
            ...collectionEntry,
            review_status: "needs_review",
            extraction: {
              ...collectionEntry.extraction,
              status: "failed",
              warnings: [
                ...collectionEntry.extraction.warnings,
                "Reading the source failed. Keep the reliable fields and correct the rest manually.",
              ].slice(-25),
            },
          });
        } catch {
          return reply(
            {
              error:
                "Reading failed and its status could not be saved. Reload to review the latest entry. The stored original has not been removed.",
            },
            503,
          );
        }
        return reply(
          {
            error: collectionEntry.source
              ? "Reading failed. Your original file is still saved. Correct the fields manually or retry reading it."
              : "Reading failed. Your saved booking fields are still here. Correct them manually or retry.",
            entry: collectionEntry,
          },
          503,
        );
      }
      return reply(
        {
          error:
            "Extraction could not be completed. Nothing was saved. Try pasted text or manual entry.",
        },
        503,
      );
    }
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Import could not be read.",
      },
      400,
    );
  }
}
