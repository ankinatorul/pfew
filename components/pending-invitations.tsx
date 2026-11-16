import { access } from "../lib/access";
import { InvitationInboxClient } from "./invitation-client";
import { z } from "zod";
const entries = z.array(
  z.object({
    id: z.uuid(),
    trip_name: z.string(),
    role: z.string(),
    expires_at: z.string(),
  }),
);
export async function PendingInvitations() {
  const { db, user } = await access();
  const capability = await db.rpc("collaboration_version");
  if (capability.error || capability.data !== 1) return null;
  const { data, error } = await db.rpc("list_my_trip_invitations");
  if (error)
    return (
      <p role="status">Invitations couldn’t load. Refresh to try again.</p>
    );
  const parsed = entries.safeParse(data);
  if (!parsed.success)
    return (
      <p role="status">Invitations couldn’t load. Refresh to try again.</p>
    );
  return <InvitationInboxClient invitations={parsed.data} userId={user.id} />;
}
