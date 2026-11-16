"use server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import type { CollaborationReply } from "../lib/collaboration";
export type InviteState = {
  url?: string;
  id?: string;
  enabled?: boolean;
  revision?: number;
  error?: string;
};
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
    .object({ trip_id: z.uuid() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Reload this trip before creating a link." };
  const { db } = await access();
  const operation = z
    .enum(["enable", "disable", "reset"])
    .safeParse(form.get("operation") || "enable");
  const revision = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(form.get("revision") || 0);
  if (!operation.success || !revision.success)
    return { error: "Refresh sharing before trying again." };
  const { data, error } = await db.rpc("manage_trip_share_link", {
    target: parsed.data.trip_id,
    operation: operation.data,
    expected_revision: revision.data,
    candidate:
      operation.data === "disable" ? null : randomBytes(32).toString("hex"),
  });
  if (error)
    return {
      error:
        error.code === "PGRST202"
          ? "Sharing links aren’t available yet. Your saved trip is unchanged."
          : "Couldn’t update sharing. Check owner access and refresh before retrying.",
    };
  const result = z
    .object({
      enabled: z.boolean(),
      revision: z.number().int().nonnegative(),
      secret: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    })
    .safeParse(data);
  if (!result.success || (result.data.enabled && !result.data.secret))
    return { error: "Couldn’t confirm sharing. Refresh before trying again." };
  refresh(parsed.data.trip_id);
  return {
    enabled: result.data.enabled,
    revision: result.data.revision,
    ...(result.data.secret ? { url: "/join/" + result.data.secret } : {}),
  };
}
export async function joinSharedTrip(
  form: FormData,
): Promise<CollaborationReply> {
  const token = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .safeParse(form.get("token"));
  if (!token.success) return { error: "This sharing link isn’t available." };
  const { db } = await access();
  const { data, error } = await db.rpc("join_trip_share_link", {
    link_hash: tokenHash(token.data),
  });
  if (error || !z.uuid().safeParse(data).success)
    return {
      error:
        "This link is no longer available. Ask the owner for the current sharing link.",
    };
  refresh(data);
  return { status: "accepted", tripId: data };
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
        "This invitation is no longer available. Ask the owner for a new link, or try the account the original invitation was reserved for.",
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
