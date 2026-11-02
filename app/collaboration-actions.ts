"use server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
export type InviteState = { url?: string; error?: string };
export async function createInvitation(
  _state: InviteState,
  form: FormData,
): Promise<InviteState> {
  const { db, user } = await access();
  const parsed = z
    .object({
      trip_id: z.uuid(),
      email: z.email().max(254),
      role: z.enum(["editor", "viewer"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Enter an email address and choose an invitation role." };
  const { data: trip } = await db
    .from("trips")
    .select("id")
    .eq("id", parsed.data.trip_id)
    .eq("owner_id", user.id)
    .single();
  if (!trip) return { error: "Only the trip owner can invite collaborators." };
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("trip_invitations").insert({
    ...parsed.data,
    email: parsed.data.email.toLowerCase(),
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  if (error)
    return {
      error:
        "Invitation could not be created. Apply the collaboration migration.",
    };
  revalidatePath("/trips/" + trip.id);
  return {
    url: new URL(
      "/invites/" + token,
      process.env.NEXT_PUBLIC_SITE_URL || "https://pfew.vercel.app",
    ).href,
  };
}
export async function acceptInvitation(form: FormData) {
  const { db } = await access();
  const token = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(form.get("token"));
  const { data, error } = await db.rpc("accept_trip_invitation", {
    invite_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error || !data)
    redirect(
      "/error?message=Invitation%20unavailable%20or%20expired.%20Use%20the%20invited%20Google%20account.",
    );
  revalidatePath("/");
  redirect("/trips/" + data);
}
export async function updateMember(form: FormData) {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      member_id: z.uuid(),
      role: z.enum(["editor", "viewer"]),
    })
    .parse(Object.fromEntries(form));
  const { error } = await db
    .from("trip_members")
    .update({ role: input.role })
    .eq("id", input.member_id)
    .eq("trip_id", input.trip_id)
    .select("id")
    .single();
  if (error)
    redirect("/error?message=Only%20the%20owner%20can%20change%20roles.");
  revalidatePath("/trips/" + input.trip_id);
}
export async function removeCollaborator(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("id"));
  const table = z
    .enum(["trip_members", "trip_invitations"])
    .parse(form.get("table"));
  const { error } = await db
    .from(table)
    .delete()
    .eq("trip_id", trip)
    .eq("id", id)
    .select("id")
    .single();
  if (error)
    redirect(
      "/error?message=Only%20the%20owner%20can%20remove%20collaborators%20or%20invitations.",
    );
  revalidatePath("/trips/" + trip);
}
