import Link from "next/link";
import { access } from "../lib/access";
import { RemoveAttachment } from "./essentials/attachment-form";

export async function TripDocuments({ tripId }: { tripId: string }) {
  const { db, user } = await access();
  const { data: files, error } = await db
    .from("booking_attachments")
    .select("id,trip_id,filename,size,state")
    .eq("trip_id", tripId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Your private documents could not be loaded.");
  return (
    <section className="card">
      <span className="eyebrow">Close at hand</span>
      <h2>Your private documents</h2>
      <p className="muted">
        Only you can access these uploads. Attach a new PDF or image from its
        booking.
      </p>
      {!files?.length && <p>No private documents for this trip yet.</p>}
      {files?.map((file) => (
        <div className="attachment-row" key={file.id}>
          {file.state === "pending" ? (
            <p>Incomplete upload: {file.filename}</p>
          ) : (
            <a
              className="button secondary"
              href={"/api/attachments/" + file.id}
            >
              Download {file.filename} · {Math.ceil(file.size / 1024)} KB
            </a>
          )}
          <RemoveAttachment trip={tripId} id={file.id} />
        </div>
      ))}
      <div className="actions">
        <Link
          className="button secondary"
          href={"/trips/" + tripId + "?view=bookings"}
        >
          Open bookings
        </Link>
        <Link className="button secondary" href="/profile">
          Manage all your uploads
        </Link>
      </div>
    </section>
  );
}
