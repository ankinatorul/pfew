import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentGoogleUser } from "../../../../lib/auth-session";
import { supabase } from "../../../../lib/supabase";
import { importDocument } from "../../../../lib/import-document";
import {
  extractLabeledText,
  liveBookingExtractor,
} from "../../../../lib/booking-extraction";
export const maxDuration = 60;
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function POST(request: Request) {
  if (!(await currentGoogleUser()))
    return reply({ error: "Sign in with Google first." }, 401);
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024)
    return reply({ error: "Choose a file up to 3 MB." }, 413);
  const form = await request.formData().catch(() => null);
  if (!form) return reply({ error: "Choose a supported source." }, 400);
  const text = String(form.get("text") || "");
  if (text.length > 16000)
    return reply({ error: "Paste up to 16,000 characters." }, 400);
  if (form.get("mode") === "text") {
    try {
      return reply({ ...extractLabeledText(text), importKey: randomUUID() });
    } catch {
      return reply({ error: "Paste labeled booking text to continue." }, 400);
    }
  }
  if (form.get("consent") !== "yes")
    return reply(
      { error: "Approve sending this document to AI before extraction." },
      400,
    );
  if (process.env.AI_MODE !== "live" || !process.env.AI_API_KEY)
    return reply(
      {
        error:
          "AI document reading is not configured yet. Add destinations or booking details manually; you can still create your trip.",
      },
      503,
    );
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    return reply({ error: "Choose one PDF, JPEG or PNG per request." }, 400);
  let document;
  try {
    document = await importDocument(file);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error ? error.message : "File could not be read.",
      },
      400,
    );
  }
  const db = await supabase();
  const { data: reservation, error } = await db.rpc("reserve_onboarding_ai");
  if (error || !reservation)
    return reply(
      {
        error:
          "AI request limits are unavailable or reached. Check onboarding migration 010 and service limits.",
      },
      429,
    );
  try {
    const result = await liveBookingExtractor().extract({ document });
    await db.rpc("finish_service", { reservation, succeeded: true });
    return reply({ ...result, importKey: randomUUID() });
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return reply(
      {
        error:
          "This source could not be read. Retry it or enter its details manually. Nothing was saved.",
      },
      503,
    );
  }
}
