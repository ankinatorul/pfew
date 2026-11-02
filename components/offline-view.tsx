import { access } from "../lib/access";
import { OfflineDownload } from "./offline-download";
export async function OfflineView({ tripId }: { tripId: string }) {
  const { db, user } = await access();
  const { data } = await db
    .from("booking_attachments")
    .select("*")
    .eq("trip_id", tripId)
    .eq("owner_id", user.id);
  return (
    <OfflineDownload
      tripId={tripId}
      userId={user.id}
      documents={(data || []).filter((file) => file.state !== "pending")}
    />
  );
}
