import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { currentGoogleUser } from "../../../lib/auth-session";
import { supabase } from "../../../lib/supabase";
import { JoinTrip } from "../../../components/join-trip";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token))
    return <JoinTrip state="invalid" token="" />;
  const user = await currentGoogleUser();
  if (!user) return <JoinTrip state="signed_out" token={token} />;
  const db = await supabase();
  const { data, error } = await db.rpc("preview_trip_share_link", {
    link_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (
    !error &&
    data?.state === "already_member" &&
    /^[a-f0-9-]{36}$/.test(data.trip_id)
  )
    redirect("/trips/" + data.trip_id);
  return (
    <JoinTrip
      token={token}
      userId={user.id}
      state={
        error ? "unavailable" : data?.state === "valid" ? "valid" : "invalid"
      }
      tripName={data?.state === "valid" ? data.trip_name : undefined}
    />
  );
}
