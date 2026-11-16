import { parseTripPeople } from "./trip-people";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharingData } from "./collaboration";
import type { Trip } from "./domain";
export async function loadSharingData(
  db: SupabaseClient,
  trip: Trip,
  userId: string,
): Promise<SharingData> {
  const base: SharingData = {
    tripId: trip.id,
    tripName: trip.name,
    userId,
    owner: trip.owner_id === userId,
    ready: false,
    members: [],
    pending: [],
  };
  if (trip.creation_state === "draft") return base;
  const capability = await db.rpc("collaboration_version");
  if (capability.error || capability.data !== 1) return base;
  const linkCapability = await db.rpc("reusable_sharing_version");
  const linkReady = !linkCapability.error && linkCapability.data === 1;
  const [members, invitations, identities] = await Promise.all([
    db
      .from("trip_members")
      .select("id,user_id,role,member_revision")
      .eq("trip_id", trip.id)
      .is("revoked_at", null),
    base.owner && linkReady
      ? db.rpc("manage_trip_share_link", {
          target: trip.id,
          operation: "read",
          expected_revision: 0,
        })
      : Promise.resolve({ data: null, error: null }),
    db.rpc("trip_people", { target: trip.id }),
  ]);
  if (members.error || invitations.error)
    return {
      ...base,
      error: "We couldn’t load sharing. Refresh to try again.",
    };
  const sharing = invitations.data as {
    enabled?: boolean;
    revision?: number;
    secret?: string | null;
  } | null;
  const people = identities.error ? null : parseTripPeople(identities.data);
  return {
    ...base,
    ready: true,
    linkReady,
    sharingLink:
      base.owner &&
      sharing &&
      typeof sharing.enabled === "boolean" &&
      typeof sharing.revision === "number"
        ? {
            enabled: sharing.enabled,
            revision: sharing.revision,
            ...(sharing.enabled && /^[a-f0-9]{64}$/.test(sharing.secret || "")
              ? { url: "/join/" + sharing.secret }
              : {}),
          }
        : undefined,
    peopleReady: !!people,
    people: people || [],
    members: (members.data || [])
      .filter((m) => m.user_id !== trip.owner_id)
      .map((m) => ({
        id: m.id,
        member_revision: m.member_revision,
        role: m.role === "viewer" ? "viewer" : "editor",
        self: m.user_id === userId,
        label:
          m.user_id === userId
            ? "You"
            : people?.find((p) => p.membershipId === m.id)?.name ||
              "Collaborator",
      })),
    pending: [],
  };
}
