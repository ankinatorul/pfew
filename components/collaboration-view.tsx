import { access } from "../lib/access";
import type { Trip } from "../lib/domain";
import type { TripRole } from "../lib/trip-role";
import {
  InviteForm,
  RemoveCollaborator,
  MemberRoleForm,
} from "./collaboration";
export async function CollaborationView({
  trip,
  role,
}: {
  trip: Trip;
  role: TripRole;
}) {
  const { db, user } = await access();
  const { data: members, error } = await db
    .from("trip_members")
    .select("id,user_id,role")
    .eq("trip_id", trip.id);
  if (error?.code === "PGRST205" || error?.code === "42P01")
    return (
      <section className="card">
        <h2>Collaboration needs a database update.</h2>
        <p>
          Apply migration 007 to enable private invitation links and shared-trip
          roles.
        </p>
      </section>
    );
  if (error) throw new Error("Could not load collaborators");
  const { data: invitations, error: inviteError } =
    role === "owner"
      ? await db
          .from("trip_invitations")
          .select("id,email,role,expires_at,accepted_by,accepted_at")
          .eq("trip_id", trip.id)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
  if (inviteError) throw new Error("Could not load invitations");
  const { data: audit, error: auditError } = await db
    .from("audit_events")
    .select("id,actor_id,entity_table,action,created_at")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (auditError) throw new Error("Could not load trip activity");
  return (
    <>
      <span className="eyebrow">Your travel people</span>
      <h2>Good trips are better together.</h2>
      <section className="card lime">
        <h3>Your role: {role}</h3>
        <p>
          Owners manage settings and access. Editors change shared content.
          Viewers read it. Personal booking documents stay private to their
          uploader.
        </p>
      </section>
      <div className="grid">
        <article className="card">
          <h3>Trip owner</h3>
          <span className="pill">
            {role === "owner" ? "You · owner" : "Owner"}
          </span>
        </article>
        {members
          ?.filter((m) => m.user_id !== trip.owner_id)
          .map((m) => (
            <article className="card" key={m.id}>
              <h3>
                {m.user_id === user.id
                  ? "You"
                  : invitations?.find((i) => i.accepted_by === m.user_id)
                      ?.email || "Member " + m.user_id.slice(0, 8)}
              </h3>
              <span className="pill">{m.role}</span>
              {role === "owner" && (
                <>
                  <MemberRoleForm trip={trip.id} id={m.id} role={m.role} />
                  <RemoveCollaborator trip={trip.id} id={m.id} />
                </>
              )}
            </article>
          ))}
      </div>
      {role === "owner" && (
        <>
          <InviteForm trip={trip.id} />
          <h3>Invitations</h3>
          <div className="grid">
            {invitations?.map((i) => (
              <article className="card" key={i.id}>
                <h3>{i.email}</h3>
                <p>
                  {i.role} ·{" "}
                  {i.accepted_at
                    ? "Accepted"
                    : new Date(i.expires_at) < new Date()
                      ? "Expired"
                      : "Pending"}
                </p>
                <p className="muted">
                  Expires {new Date(i.expires_at).toLocaleString()}
                </p>
                <RemoveCollaborator trip={trip.id} id={i.id} invitation />
              </article>
            ))}
          </div>
        </>
      )}
      <details>
        <summary>Recent shared-trip activity</summary>
        <section className="card">
          {audit?.map((e) => (
            <p key={e.id}>
              {e.actor_id === user.id
                ? "You"
                : e.actor_id
                  ? "Member " + e.actor_id.slice(0, 8)
                  : "System"}{" "}
              · {e.action.toLowerCase()} · {e.entity_table.replaceAll("_", " ")}{" "}
              · {new Date(e.created_at).toLocaleString()}
            </p>
          ))}
          {!audit?.length && <p>No recorded changes yet.</p>}
          <p className="muted">
            Activity records contain action and record identifiers, not document
            contents, booking references or private notes.
          </p>
        </section>
      </details>
    </>
  );
}
