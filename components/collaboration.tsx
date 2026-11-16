"use client";
import { useActionState, useState } from "react";
import {
  createInvitation,
  removeCollaborator,
  updateMember,
} from "../app/collaboration-actions";
import { Button } from "./button";
import { Submit } from "./forms";
export function InviteForm({ trip }: { trip: string }) {
  const [state, action, pending] = useActionState(createInvitation, {});
  const [copied, setCopied] = useState(false);
  return (
    <section className="card">
      <h3>Bring your people along.</h3>
      <form action={action}>
        <input type="hidden" name="trip_id" value={trip} />
        <label>
          Invited email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <input type="hidden" name="role" value="editor" />
        <p className="muted">
          The invitation expires in seven days and requires that exact verified
          email. Files stay private unless their uploader explicitly shares
          them.
        </p>
        <Button disabled={pending}>
          {pending ? "Creating…" : "Create invitation link"}
        </Button>
      </form>
      {state.error && <p role="alert">{state.error}</p>}
      {state.url && (
        <div className="invite-result">
          <label>
            Share this invitation link
            <input
              readOnly
              value={
                typeof window !== "undefined"
                  ? new URL(state.url, window.location.origin).href
                  : state.url
              }
            />
          </label>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  new URL(state.url!, window.location.origin).href,
                );
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy invitation link"}
          </Button>
          <p className="muted">
            Share the link yourself. Pfew has not sent an email.
          </p>
        </div>
      )}
    </section>
  );
}
export function RemoveCollaborator({
  trip,
  id,
  invitation = false,
  revision = 0,
}: {
  trip: string;
  id: string;
  invitation?: boolean;
  revision?: number;
}) {
  return (
    <form
      action={removeCollaborator}
      onSubmit={(e) => {
        if (
          !confirm(
            invitation
              ? "Cancel this invitation?"
              : "Remove this person’s access to the trip? Their private documents remain in their own account.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input
        type="hidden"
        name="table"
        value={invitation ? "trip_invitations" : "trip_members"}
      />
      <Button variant="danger">
        {invitation ? "Cancel invitation" : "Remove member"}
      </Button>
    </form>
  );
}
export function MemberRoleForm({
  trip,
  id,
  role,
  revision = 0,
}: {
  trip: string;
  id: string;
  role: string;
  revision?: number;
}) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="member_id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <label>
        Role
        <select name="role" defaultValue={role}>
          {role === "viewer" && (
            <option value="viewer" disabled>
              Legacy viewer
            </option>
          )}
          <option value="editor">Editor</option>
        </select>
      </label>
      <Submit>Save role</Submit>
    </form>
  );
}
