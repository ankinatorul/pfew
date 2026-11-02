import { access } from "../../lib/access";
import { UploadForm, RemoveAttachment } from "./attachment-form";
export async function Attachments({
  trip,
  booking,
}: {
  trip: string;
  booking: string;
}) {
  const { db } = await access();
  const { data, error } = await db
    .from("booking_attachments")
    .select("*")
    .eq("trip_id", trip)
    .eq("booking_id", booking);
  if (error?.code === "PGRST205" || error?.code === "42P01")
    return (
      <p className="muted">
        Apply migration 004 to enable private attachments.
      </p>
    );
  if (error) throw new Error("Could not load booking documents");
  return (
    <details>
      <summary>Your private documents ({data?.length || 0})</summary>
      {data?.map((f) => (
        <div className="attachment-row" key={f.id}>
          {f.state === "pending" ? (
            <p>Incomplete upload: {f.filename}. Remove it and retry.</p>
          ) : (
            <a className="button secondary" href={"/api/attachments/" + f.id}>
              Download {f.filename} · {Math.ceil(f.size / 1024)} KB
            </a>
          )}
          <RemoveAttachment trip={trip} id={f.id} />
        </div>
      ))}
      <UploadForm trip={trip} booking={booking} />
    </details>
  );
}
