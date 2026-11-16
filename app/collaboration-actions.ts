"use server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import type { CollaborationReply } from "../lib/collaboration";
export type InviteState = { url?: string; error?: string };
function refresh(trip?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/trips");
  if (trip) revalidatePath("/trips/" + trip);
}
function fail(message: string): never {
  redirect("/error?message=" + encodeURIComponent(message));
}
const unavailable =
  "Collaboration is not available yet. Your saved trips are unchanged.";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createInvitation(
  _state: InviteState,
  form: FormData,
): Promise<InviteState> {
  const parsed = z
    .object({ trip_id: z.uuid(), email: z.string().trim().email().max(254) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid invitation email." };
  const { db } = await access();
  const token = randomBytes(32).toString("hex");
  const { error } = await db.rpc("create_trip_invitation", {
    target: parsed.data.trip_id,
    recipient: parsed.data.email.toLowerCase(),
    invite_hash: tokenHash(token),
  });
  if (error)
    return {
      error: /pending/i.test(error.message)
        ? "An invitation is already pending. Cancel it before creating another."
        : /already.*access/i.test(error.message)
          ? "Already a collaborator. Refresh to see their access."
          : error.code === "PGRST202"
            ? unavailable
            : "Only the owner of a finalized trip can create this invitation. Check access and retry.",
    };
  refresh(parsed.data.trip_id);
  // Relative copy links stay on the current app origin, including localhost.
  return { url: "/invites/" + token };
}
export async function respondInvitationState(
  form: FormData,
): Promise<CollaborationReply> {
  const { db } = await access();
  const decision = z
    .enum(["accept", "decline"])
    .safeParse(form.get("decision"));
  if (!decision.success) return { error: "Choose Accept or Decline." };
  const capability = await db.rpc("collaboration_version");
  if (capability.error || capability.data !== 1) return { error: unavailable };
  let result;
  if (form.has("token")) {
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .safeParse(form.get("token"));
    if (!token.success) return { error: "This invitation is not available." };
    result = await db.rpc(
      decision.data === "accept"
        ? "accept_trip_invitation"
        : "decline_trip_invitation",
      { invite_hash: tokenHash(token.data) },
    );
  } else {
    const id = z.uuid().safeParse(form.get("id"));
    if (!id.success) return { error: "This invitation is not available." };
    result = await db.rpc("respond_trip_invitation", {
      invitation_id: id.data,
      accept: decision.data === "accept",
    });
  }
  if (result.error || (decision.data === "accept" && !result.data))
    return {
      error:
        "This invitation is no longer available. Check your signed-in email or ask the owner for a new link.",
    };
  refresh();
  return {
    status: decision.data === "accept" ? "accepted" : "declined",
    ...(decision.data === "accept" ? { tripId: result.data } : {}),
  };
}
export async function acceptInvitation(form: FormData) {
  form.set("decision", "accept");
  const result = await respondInvitationState(form);
  if (result.error) fail(result.error);
  redirect("/trips/" + result.tripId);
}
export async function declineInvitation(form: FormData) {
  form.set("decision", "decline");
  const result = await respondInvitationState(form);
  if (result.error) fail(result.error);
  redirect("/trips");
}
export async function respondInvitation(form: FormData) {
  const result = await respondInvitationState(form);
  if (result.error) fail(result.error);
  redirect(result.tripId ? "/trips/" + result.tripId : "/trips");
}
export async function updateMember(form: FormData) {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      member_id: z.uuid(),
      role: z.literal("editor"),
      revision: z.coerce.number().int().nonnegative(),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    fail("Choose an editor membership and reload its current revision.");
  const { error } = await db.rpc("manage_trip_member", {
    target: input.data.trip_id,
    member: input.data.member_id,
    expected_revision: input.data.revision,
    remove: false,
  });
  if (error)
    fail(
      "Only the owner can update a current membership. Reload before retrying.",
    );
  refresh(input.data.trip_id);
}
export async function manageSharing(
  form: FormData,
): Promise<CollaborationReply> {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      id: z.uuid(),
      operation: z.enum(["remove", "revoke", "scope"]),
      revision: z.coerce.number().int().nonnegative().default(0),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Reload this trip before trying again." };
  const { trip_id: trip, id, operation, revision } = input.data;
  let result;
  if (operation === "scope") {
    const scope = z.enum(["private", "shared"]).safeParse(form.get("scope"));
    if (!scope.success) return { error: "Choose Private or Shared with trip." };
    result = await db.rpc("set_trip_file_scope", {
      target: trip,
      document: id,
      expected_revision: revision,
      scope: scope.data,
    });
  } else if (operation === "remove")
    result = await db.rpc("manage_trip_member", {
      target: trip,
      member: id,
      expected_revision: revision,
      remove: true,
    });
  else
    result = await db.rpc("revoke_trip_invitation", {
      target: trip,
      invitation_id: id,
    });
  if (result.error)
    return {
      error:
        result.error.code === "PGRST202"
          ? unavailable
          : /changed/i.test(result.error.message)
            ? "This changed in another tab. Refresh before trying again."
            : operation === "scope"
              ? "Couldn’t change sharing. Only the active uploader can share eligible files. Identity documents stay private."
              : "Couldn’t update access. Check owner permissions and refresh before retrying.",
    };
  refresh(trip);
  return {
    message:
      operation === "scope"
        ? "Document privacy updated."
        : operation === "remove"
          ? "Collaborator removed."
          : "Invitation revoked.",
  };
}
export async function removeCollaborator(form: FormData) {
  form.set(
    "operation",
    form.get("table") === "trip_members" ? "remove" : "revoke",
  );
  const result = await manageSharing(form);
  if (result.error) fail(result.error);
}
export async function setDocumentSharing(form: FormData) {
  form.set("operation", "scope");
  const result = await manageSharing(form);
  if (result.error) fail(result.error);
}
