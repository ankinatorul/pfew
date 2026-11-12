"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { removePrivateDocument } from "../lib/private-document-removal";
import { MAX_FILE_SIZE, validFileType, safeFilename } from "../lib/files";
function fail(message: string): never {
  redirect("/error?message=" + encodeURIComponent(message));
}
export async function uploadAttachment(form: FormData) {
  const { db, user } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const booking = z.uuid().parse(form.get("booking_id"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_SIZE)
    fail("Choose a PDF, JPEG or PNG no larger than 3 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validFileType(bytes, file.type))
    fail("File contents must match PDF, JPEG or PNG format.");
  const { data: record } = await db
    .from("bookings")
    .select("id")
    .eq("id", booking)
    .eq("trip_id", trip)
    .single();
  if (!record) fail("Booking unavailable");
  const id = crypto.randomUUID();
  const path = [user.id, trip, booking, id].join("/");
  const { error: reservationError } = await db
    .from("booking_attachments")
    .insert({
      id,
      trip_id: trip,
      booking_id: booking,
      owner_id: user.id,
      path,
      filename: safeFilename(file.name),
      content_type: file.type,
      size: file.size,
      state: "pending",
    });
  if (reservationError)
    fail(
      "Could not reserve this private upload. Apply migration 008, check editing access and the 10-document limit.",
    );
  const { error } = await db.storage.from("booking-files").upload(path, bytes, {
    contentType: file.type,
    cacheControl: "0",
    upsert: false,
  });
  if (error) {
    // A transport error can occur after Storage received the object. Keep the
    // reservation until deletion is confirmed, so its owner can still remove it.
    const cleanup = await db.storage.from("booking-files").remove([path]);
    if (!cleanup.error)
      await db.from("booking_attachments").delete().eq("id", id);
    revalidatePath("/profile");
    revalidatePath("/trips/" + trip);
    fail(
      "Upload could not be completed. Check Your account for an incomplete upload before retrying.",
    );
  }
  const { error: readyError } = await db
    .from("booking_attachments")
    .update({ state: "ready" })
    .eq("id", id)
    .select("id")
    .single();
  revalidatePath("/profile");
  if (readyError) {
    revalidatePath("/trips/" + trip);
    fail(
      "The file was received but could not be marked complete. Remove the incomplete upload from Your account and retry.",
    );
  }
  revalidatePath("/trips/" + trip);
  revalidatePath("/profile");
}
export async function deleteAttachment(form: FormData) {
  const { db } = await access();
  const id = z.uuid().parse(form.get("id"));
  const trip = z.uuid().parse(form.get("trip_id"));
  const error = await removePrivateDocument(db, trip, id);
  if (error) fail(error);
  revalidatePath("/trips/" + trip);
  revalidatePath("/profile");
}
