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
          Invited Google email
          <input name="email" type="email" required maxLength={254} />
        </label>
        <label>
          Role
          <select name="role" defaultValue="viewer">
            <option value="viewer">Viewer · read shared trip content</option>
            <option value="editor">
              Editor · add and change shared content
            </option>
          </select>
        </label>
        <p className="muted">
          The invitation expires in seven days and requires that exact verified
          Google email. Personal documents remain private to their uploader.
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
            <input readOnly value={state.url} />
          </label>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.url!);
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
}: {
  trip: string;
  id: string;
  invitation?: boolean;
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
}: {
  trip: string;
  id: string;
  role: string;
}) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="member_id" value={id} />
      <label>
        Role
        <select name="role" defaultValue={role}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
      </label>
      <Submit>Save role</Submit>
    </form>
  );
}
