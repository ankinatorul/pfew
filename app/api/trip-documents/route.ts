import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { MAX_FILE_SIZE, validFileType, safeFilename } from "../../../lib/files";
import { documentCategories } from "../../../lib/packing-documents";
import { removePrivateDocument } from "../../../lib/private-document-removal";
import { revalidatePath } from "next/cache";
const safeColumns =
  "id,trip_id,booking_id,intake_id,filename,content_type,size,created_at,state,document_kind,display_name,document_category,documents_hidden,document_revision";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function POST(request: Request) {
  const user = await currentGoogleUser();
  if (!user) return reply({ error: "Sign in required." }, 401);
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024)
    return reply({ error: "Choose a file no larger than 3 MB." }, 413);
  const multipart = request.headers
      .get("content-type")
      ?.includes("multipart/form-data"),
    form = multipart ? await request.formData().catch(() => null) : null;
  const body = form
    ? Object.fromEntries(form)
    : await request.json().catch(() => null);
  const meta = z
    .object({
      trip_id: z.uuid(),
      id: z.uuid(),
      action: z.enum(["upload", "recover", "metadata", "delete"]),
    })
    .safeParse(body);
  if (!meta.success)
    return reply({ error: "Choose a valid trip and document." }, 400);
  const { trip_id: trip, id, action } = meta.data,
    db = await supabase();
  const old = await db
    .from("booking_attachments")
    .select("*")
    .eq("trip_id", trip)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (old.error)
    return reply(
      { error: "Your document could not be checked. Nothing was changed." },
      503,
    );
  try {
    if (action === "delete") {
      const revision = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(body.revision);
      const error = await removePrivateDocument(db, trip, id, {
        tripOnly: true,
        revision,
      });
      if (error) return reply({ error }, 409);
      revalidatePath("/");
      revalidatePath("/trips/" + trip);
      revalidatePath("/profile");
      return reply({ id, message: "Document removed." });
    }
    if (action === "metadata") {
      const input = z
        .object({
          label: z.string().trim().min(1).max(200),
          category: z.enum(documentCategories),
          hidden: z.boolean(),
          revision: z.number().int().nonnegative(),
        })
        .parse(body);
      const { error } = await db.rpc("save_document_metadata", {
        target: trip,
        document: id,
        expected_revision: input.revision,
        label: input.label,
        category: input.category,
        hidden: input.hidden,
      });
      if (error)
        return reply(
          {
            error: /changed|unavailable|name|category/.test(error.message)
              ? error.message
              : "Could not update this private document.",
          },
          409,
        );
    } else {
      if (old.data && old.data.document_kind !== "trip")
        return reply(
          {
            error:
              "Use the existing booking file workflow for this confirmation.",
          },
          400,
        );
      let record = old.data;
      let bytes: Uint8Array | undefined;
      if (action === "upload") {
        const file = body.file;
        if (
          !(file instanceof File) ||
          file.size < 1 ||
          file.size > MAX_FILE_SIZE
        )
          return reply({ error: "Choose a PDF, JPEG or PNG up to 3 MB." }, 400);
        bytes = new Uint8Array(await file.arrayBuffer());
        if (!validFileType(bytes, file.type))
          return reply(
            { error: "File contents must match PDF, JPEG or PNG." },
            400,
          );
        const checksum = hash(bytes);
        if (record && record.content_sha256 !== checksum)
          return reply(
            { error: "This is a different file. Add it as a new document." },
            409,
          );
        if (!record) {
          const label = z
              .string()
              .trim()
              .min(1)
              .max(200)
              .parse(body.label || safeFilename(file.name)),
            category = z
              .enum(documentCategories)
              .parse(body.category || "Other");
          const { data, error } = await db
            .from("booking_attachments")
            .insert({
              id,
              trip_id: trip,
              owner_id: user.id,
              booking_id: null,
              intake_id: null,
              path: [user.id, trip, "documents", id].join("/"),
              filename: safeFilename(file.name),
              content_type: file.type,
              size: file.size,
              content_sha256: checksum,
              state: "pending",
              document_kind: "trip",
              display_name: label,
              document_category: category,
            })
            .select("*")
            .single();
          if (error)
            return reply(
              {
                error:
                  "Could not reserve this upload. Check trip editing access and reviewed update 016.",
              },
              409,
            );
          record = data;
        }
      }
      if (!record)
        return reply(
          { error: "Choose your original file to start this upload." },
          404,
        );
      if (record.state !== "ready") {
        // A failed upload response may follow a successful Storage write. Check the
        // reserved object before retrying; never overwrite or delete an original.
        let downloaded = await db.storage
          .from("booking-files")
          .download(record.path);
        if (downloaded.error && bytes) {
          await db.storage
            .from("booking-files")
            .upload(record.path, bytes, {
              contentType: record.content_type,
              upsert: false,
              cacheControl: "0",
            });
          downloaded = await db.storage
            .from("booking-files")
            .download(record.path);
        }
        if (downloaded.error || !downloaded.data)
          return reply(
            {
              error:
                "Upload is not confirmed. Check saved upload, or reselect the original file to retry.",
              id,
            },
            409,
          );
        const stored = new Uint8Array(await downloaded.data.arrayBuffer());
        if (
          stored.byteLength !== record.size ||
          hash(stored) !== record.content_sha256
        )
          return reply(
            {
              error:
                "Stored file verification failed. The original was kept; contact support before retrying.",
              id,
            },
            409,
          );
        const { error } = await db
          .from("booking_attachments")
          .update({ state: "ready" })
          .eq("id", id)
          .eq("owner_id", user.id)
          .select("id")
          .single();
        if (error)
          return reply(
            {
              error:
                "Original saved. Check saved upload to finish its metadata.",
              id,
            },
            409,
          );
      }
    }
    const { data, error } = await db
      .from("booking_attachments")
      .select(safeColumns)
      .eq("trip_id", trip)
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (error)
      return reply(
        { error: "Change may be saved. Reload your documents to check.", id },
        503,
      );
    revalidatePath("/");
    revalidatePath("/trips/" + trip);
    revalidatePath("/profile");
    return reply({
      file: data,
      message: action === "metadata" ? "Document updated." : "Original saved.",
    });
  } catch {
    return reply(
      {
        error:
          "Could not finish. Your original and input are kept; check the saved upload before retrying.",
        id,
      },
      400,
    );
  }
}
