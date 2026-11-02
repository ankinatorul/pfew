import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase, configured } from "../../../../lib/supabase";
import { safeFilename } from "../../../../lib/files";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!configured() || !z.uuid().safeParse(id).success)
    return new NextResponse("Unavailable", { status: 404 });
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const { data: record } = await db
    .from("booking_attachments")
    .select("path,filename")
    .eq("id", id)
    .single();
  if (!record) return new NextResponse("Document unavailable", { status: 404 });
  const { data, error } = await db.storage
    .from("booking-files")
    .createSignedUrl(record.path, 60, {
      download: safeFilename(record.filename),
    });
  if (error || !data)
    return new NextResponse("Download unavailable", { status: 503 });
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
