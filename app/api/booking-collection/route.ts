import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { MAX_FILE_SIZE, validFileType, safeFilename } from "../../../lib/files";
import {
  emptyCollectionEntry,
  collectionFieldsSchema,
  reservationStatuses,
  reviewedBookingFields,
  type CollectionEntry,
} from "../../../lib/booking-collection";
import {
  ownedCollection,
  persistCollectionEntry,
  collectionSetupMessage,
} from "../../../lib/booking-collection-server";
import { bookingLocationValues } from "../../../lib/automatic-zones";
import { removeBookingFiles } from "../../../lib/storage-cleanup";
import { revalidatePath } from "next/cache";

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
const metadata = z.object({
  trip_id: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
});
export async function POST(request: Request) {
  const user = await currentGoogleUser();
  if (!user) return reply({ error: "Sign in required" }, 401);
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024)
    return reply(
      { error: "Choose one file no larger than 3 MB per upload." },
      413,
    );
  const multipart = request.headers
    .get("content-type")
    ?.includes("multipart/form-data");
  const form = multipart ? await request.formData().catch(() => null) : null;
  const body = form
    ? Object.fromEntries(form)
    : await request.json().catch(() => null);
  const parsed = metadata.safeParse({
    ...body,
    revision: Number(body?.revision),
  });
  if (!parsed.success)
    return reply({ error: "Choose a valid private booking draft." }, 400);
  const input = parsed.data,
    db = await supabase();
  let entry: CollectionEntry | undefined;
  try {
    const context = await ownedCollection(db, user.id, input.trip_id);
    const old = context.entries.find((e) => e.id === input.id);
    entry = old || emptyCollectionEntry(input.id);
    if (
      old &&
      old.revision !== input.revision &&
      body.action !== "save" &&
      !(["upload", "recover_upload"].includes(body.action) && old.source) &&
      !(body.action === "remove" && old.removing)
    )
      return reply(
        {
          error:
            "This booking changed in another tab. Reload before saving again.",
          entry: old,
        },
        409,
      );
    if (entry.removing && body.action !== "remove")
      return reply(
        { error: "Finish removing this entry before editing it.", entry },
        409,
      );
    if (body.action === "advance") {
      const { error } = await db.rpc("advance_booking_collection", {
        target: input.trip_id,
      });
      if (error)
        throw new Error(
          "Your progress could not be saved. Your bookings remain saved; please retry.",
        );
      revalidatePath("/trips/new");
      return reply({ advanced: true });
    }
    if (body.action === "remove") {
      if (!old) return reply({ removed: input.id });
      if (!entry.removing)
        entry = await persistCollectionEntry(db, input.trip_id, {
          ...entry,
          removing: true,
        });
      const fileError = await removeBookingFiles(
        db,
        input.trip_id,
        undefined,
        input.id,
      );
      if (fileError) throw new Error(fileError);
      const { error } = await db.rpc("save_booking_intake", {
        target: input.trip_id,
        item_id: input.id,
        expected_revision: entry.revision,
        entry: {},
        remove_item: true,
      });
      if (error)
        throw new Error(
          "Files were removed but entry cleanup needs a retry. Your booking fields remain saved.",
        );
      revalidatePath("/trips/new");
      revalidatePath("/trips/" + input.trip_id);
      return reply({ removed: input.id });
    }
    if (body.action === "upload" || body.action === "recover_upload") {
      const file = form?.get("file");
      let bytes: Uint8Array | undefined;
      if (body.action === "upload") {
        if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE)
          throw new Error("Choose a PDF, JPEG or PNG no larger than 3 MB.");
        bytes = new Uint8Array(await file.arrayBuffer());
        if (!validFileType(bytes, file.type))
          throw new Error("File contents must match PDF, JPEG or PNG.");
        const checksum = createHash("sha256").update(bytes).digest("hex");
        if (entry.source && entry.source.checksum !== checksum)
          throw new Error(
            "This is a different source file. Add it as a new entry instead.",
          );
        if (!entry.source)
          entry = await persistCollectionEntry(db, input.trip_id, {
            ...entry,
            source: {
              attachment_id: crypto.randomUUID(),
              filename: safeFilename(file.name),
              size: file.size,
              content_type: file.type,
              checksum,
            },
          });
      }
      if (!entry.source)
        throw new Error(
          "Choose the original source file to retry this upload.",
        );
      const source = entry.source,
        path = [user.id, input.trip_id, input.id, source.attachment_id].join(
          "/",
        );
      const existing = await db
        .from("booking_attachments")
        .select("id,state,content_sha256,path")
        .eq("id", source.attachment_id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (existing.error)
        throw new Error(
          "The upload reservation could not be checked. Retry safely with the same file.",
        );
      if (
        existing.data &&
        (existing.data.content_sha256 !== source.checksum ||
          existing.data.path !== path)
      )
        throw new Error("The saved upload does not match this source.");
      if (!existing.data) {
        const { error } = await db.from("booking_attachments").insert({
          id: source.attachment_id,
          trip_id: input.trip_id,
          booking_id: null,
          intake_id: input.id,
          owner_id: user.id,
          path,
          filename: source.filename,
          content_type: source.content_type,
          size: source.size,
          content_sha256: source.checksum,
          state: "pending",
        });
        if (error)
          throw new Error(
            "Could not reserve the upload. Your entry is saved; retry the same file.",
          );
      }
      if (existing.data?.state !== "ready") {
        if (bytes)
          await db.storage.from("booking-files").upload(path, bytes, {
            contentType: source.content_type,
            cacheControl: "0",
            upsert: false,
          });
        // Verify receipt even when the upload response was lost or said duplicate.
        const stored = await db.storage.from("booking-files").download(path);
        if (stored.error || !stored.data)
          throw new Error(
            "Upload is not confirmed. Your entry is saved, but the file may not be stored. Retry the upload or check again.",
          );
        const digest = createHash("sha256")
          .update(new Uint8Array(await stored.data.arrayBuffer()))
          .digest("hex");
        if (digest !== source.checksum)
          throw new Error(
            "The stored file does not match the source. Your booking fields remain saved.",
          );
        const { error } = await db
          .from("booking_attachments")
          .update({ state: "ready" })
          .eq("id", source.attachment_id)
          .eq("owner_id", user.id)
          .select("id")
          .single();
        if (error)
          throw new Error(
            "The file was received but completion is not confirmed. Check the upload again; no re-upload is needed if verification succeeds.",
          );
      }
      revalidatePath("/trips/new");
      return reply({
        entry,
        attachment: {
          id: source.attachment_id,
          intake_id: input.id,
          filename: source.filename,
          size: source.size,
          state: "ready",
        },
      });
    }
    if (body.action !== "save")
      return reply({ error: "Choose a supported booking action." }, 400);
    const fields = collectionFieldsSchema.parse(body.fields);
    if (fields.payment_due_date) {
      if (!z.iso.date().safeParse(fields.payment_due_date).success)
        return reply({ error: "Choose a valid payment due date." }, 400);
      const capability = await db
        .from("bookings")
        .select("payment_due_date")
        .limit(0);
      if (capability.error)
        return reply(
          {
            error:
              "Payment deadlines aren’t available yet. Your other details are still here.",
          },
          409,
        );
    }
    const reservation_status = z
      .enum(reservationStatuses)
      .parse(body.reservation_status);
    const review_status = z
      .enum(["needs_review", "reviewed"])
      .parse(body.review_status);
    if (review_status === "reviewed") {
      const values = new FormData();
      Object.entries(fields).forEach(([key, value]) =>
        values.set(key, String(value ?? "")),
      );
      values.set("trip_id", input.trip_id);
      // Staging IDs are not normal booking IDs; resolve current geographic context.
      values.delete("id");
      const canonical = await bookingLocationValues(db, values);
      // A compact edit must not replace a saved zone/legacy geographic label
      // merely because its controls are no longer visible. Resolve changed
      // point IDs as before; preserve unchanged context from the owned entry.
      for (const prefix of ["", "end_"]) {
        const samePoint =
          fields[prefix + "location_id"] ===
          entry.fields[prefix + "location_id"];
        if (samePoint && fields.segment_id === entry.fields.segment_id) {
          const zone = prefix === "end_" ? "end_timezone" : "timezone";
          if (entry.fields[zone] && fields[zone] === entry.fields[zone])
            canonical[zone] = entry.fields[zone];
          if (!fields[prefix + "location_id"])
            for (const part of ["location_label", "latitude", "longitude"]) {
              const key = prefix + part;
              if (
                entry.fields[key] !== undefined &&
                fields[key] === entry.fields[key]
              )
                canonical[key] = entry.fields[key];
            }
        }
      }
      const reviewed = reviewedBookingFields(
        canonical as CollectionEntry["fields"],
        input.trip_id,
      );
      if (!reviewed.success)
        return reply(
          {
            error:
              "Check the booking name, type, dates, places, currency and amounts before marking reviewed. You can save it as Needs review instead.",
          },
          400,
        );
      Object.assign(fields, reviewed.data);
    }
    entry = await persistCollectionEntry(db, input.trip_id, {
      ...entry,
      revision: input.revision,
      fields,
      reservation_status,
      review_status,
    });
    let materialized = false;
    if (
      context.trip.creation_state === "finalized" &&
      review_status === "reviewed"
    ) {
      const { error } = await db.rpc("materialize_booking_intake", {
        target: input.trip_id,
        item_id: input.id,
        expected_revision: entry.revision,
      });
      if (error)
        throw new Error(
          "Your reviewed fields are saved, but adding the normal booking needs a retry. Nothing was discarded.",
        );
      materialized = true;
    }
    revalidatePath("/trips/new");
    revalidatePath("/trips/" + input.trip_id);
    return reply({ entry, materialized });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Booking collection is unavailable. Your inputs are still here.";
    return reply(
      { error: message, ...(entry ? { entry } : {}) },
      message.includes("owner access")
        ? 403
        : message === collectionSetupMessage
          ? 503
          : 400,
    );
  }
}
