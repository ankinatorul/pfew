import { NextResponse } from "next/server";
import { authProviderDiagnostics } from "../../../../lib/auth-providers";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await authProviderDiagnostics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
