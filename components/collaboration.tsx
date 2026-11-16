"use client";
import { removeCollaborator, updateMember } from "../app/collaboration-actions";
import { Button } from "./button";
import { Submit } from "./forms";
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
