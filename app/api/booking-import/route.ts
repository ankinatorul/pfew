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
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return reply({ error: "Sign in required" }, 401);
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
  try {
    if (input.mode === "text")
      return reply({
        ...extractLabeledText(input.text),
        importKey: randomUUID(),
      });
    if (form.get("consent") !== "yes")
      return reply(
        {
          error:
            "Choose whether to send this source to the AI provider before continuing.",
        },
        400,
      );
    const provider = liveBookingExtractor();
    const file = form.get("file");
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
      return reply({ ...result, importKey: randomUUID() });
    } catch {
      await db.rpc("finish_service", { reservation, succeeded: false });
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
