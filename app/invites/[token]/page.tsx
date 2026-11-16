import { createHash } from "node:crypto";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { logout } from "../../actions";
import { InvitationClient } from "../../../components/invitation-client";
import type { InvitationStatus } from "../../../lib/collaboration";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Invitation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = /^[a-f0-9]{64}$/.test(token);
  // Static states have no client callback/secret; client handles the same view.
  if (!valid)
    return <InvitationClient token="" initialStatus="invalid" userId="" />;
  const user = await currentGoogleUser();
  const returnTo = "/invites/" + token;
  if (!user)
    return (
      <InvitationClient
        token={token}
        initialStatus="signed_out"
        userId=""
        signInHref={"/login?next=" + encodeURIComponent(returnTo)}
      />
    );
  const db = await supabase();
  const capability = await db.rpc("collaboration_version");
  if (capability.error || capability.data !== 1)
    return (
      <InvitationClient
        token={token}
        initialStatus="unavailable"
        userId={user.id}
      />
    );
  const { data, error } = await db.rpc("preview_trip_invitation", {
    invite_hash: createHash("sha256").update(token).digest("hex"),
  });
  const allowed: InvitationStatus[] = [
    "valid",
    "accepted",
    "declined",
    "revoked",
    "expired",
  ];
  const state: InvitationStatus = error
    ? "unavailable"
    : !data
      ? "wrong_account"
      : allowed.includes(data.state)
        ? data.state
        : data.accepted
          ? "accepted"
          : "valid";
  return (
    <InvitationClient
      token={token}
      initialStatus={state}
      userId={user.id}
      email={user.email}
      tripName={data?.trip_name}
      tripId={data?.trip_id}
      accountAction={
        <form action={logout}>
          <input type="hidden" name="next" value={returnTo} />
          <button className="button">Use a different account</button>
        </form>
      }
    />
  );
}
