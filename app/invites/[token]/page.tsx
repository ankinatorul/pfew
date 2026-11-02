import { createHash } from "node:crypto";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { acceptInvitation } from "../../collaboration-actions";
import { Submit } from "../../../components/forms";
export default async function Invitation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const user = await currentGoogleUser();
  if (!user) redirect("/login?next=" + encodeURIComponent("/invites/" + token));
  const db = await supabase();
  const { data, error } = await db.rpc("preview_trip_invitation", {
    invite_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error || !data)
    return (
      <section className="card">
        <h1>This invitation isn’t available.</h1>
        <p>
          It may have expired, been cancelled or been sent to another Google
          email. You’re signed in as {user.email}.
        </p>
        <Link className="button secondary" href="/profile">
          Your account
        </Link>
      </section>
    );
  return (
    <section className="hero">
      <span className="eyebrow">An adventure together</span>
      <h1>Join {data.trip_name}.</h1>
      <p>
        Invited role: {data.role}. Your Google email: {user.email}. Private
        personal documents are not shared with collaborators.
      </p>
      <form action={acceptInvitation}>
        <input type="hidden" name="token" value={token} />
        <Submit>
          {data.accepted ? "Open shared trip" : "Accept invitation"}
        </Submit>
      </form>
    </section>
  );
}
