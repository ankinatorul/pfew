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
  const [members, invitations, identities] = await Promise.all([
    db
      .from("trip_members")
      .select("id,user_id,role,member_revision")
      .eq("trip_id", trip.id)
      .is("revoked_at", null),
    base.owner
      ? db
          .from("trip_invitations")
          .select("id,email,accepted_at,expires_at,revoked_at,declined_at")
          .eq("trip_id", trip.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    db.rpc("trip_people", { target: trip.id }),
  ]);
  if (members.error || invitations.error)
    return {
      ...base,
      error: "We couldn’t load sharing. Refresh to try again.",
    };
  const people = identities.error ? null : parseTripPeople(identities.data);
  return {
    ...base,
    ready: true,
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
    pending: (invitations.data || [])
      .filter(
        (i) =>
          !i.accepted_at &&
          !i.revoked_at &&
          !i.declined_at &&
          Date.parse(i.expires_at) > Date.now(),
      )
      .map((i) => ({ id: i.id, email: i.email, expires_at: i.expires_at })),
  };
}
