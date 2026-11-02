"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
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
  const { count, error: countError } = await db
    .from("booking_attachments")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking);
  if (countError) fail("Apply the private booking files migration first.");
  if ((count ?? 0) >= 10) fail("Keep up to 10 documents per booking.");
  const id = crypto.randomUUID();
  const path = [user.id, trip, booking, id].join("/");
  const { error } = await db.storage
    .from("booking-files")
    .upload(path, bytes, {
      contentType: file.type,
      cacheControl: "0",
      upsert: false,
    });
  if (error)
    fail(
      "Upload failed. Check the private storage migration and your connection.",
    );
  const { error: metaError } = await db
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
    });
  if (metaError) {
    await db.storage.from("booking-files").remove([path]);
    fail("Document metadata could not be saved. Please try again.");
  }
  revalidatePath("/trips/" + trip);
}
export async function deleteAttachment(form: FormData) {
  const { db } = await access();
  const id = z.uuid().parse(form.get("id"));
  const trip = z.uuid().parse(form.get("trip_id"));
  const { data } = await db
    .from("booking_attachments")
    .select("path")
    .eq("id", id)
    .eq("trip_id", trip)
    .single();
  if (!data) fail("Document unavailable");
  const { error } = await db.storage.from("booking-files").remove([data.path]);
  if (error) fail("Could not remove stored document");
  const { error: metaError } = await db
    .from("booking_attachments")
    .delete()
    .eq("id", id)
    .eq("trip_id", trip);
  if (metaError)
    fail("Document removed, but metadata cleanup failed. Please retry.");
  revalidatePath("/trips/" + trip);
}
