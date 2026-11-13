"use client";
import { BookingUploadArea } from "../shared-booking";
import { useOnline } from "./online";
import { uploadAttachment, deleteAttachment } from "../../app/file-actions";
import { Submit } from "../forms";
import { Button } from "../button";
export function UploadForm({
  trip,
  booking,
}: {
  trip: string;
  booking: string;
}) {
  const online = useOnline();
  return (
    <form action={uploadAttachment} className="attachment-form">
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="booking_id" value={booking} />
      <fieldset disabled={!online}>
        <BookingUploadArea disabled={!online} multiple={false} />
        {!online && <p role="status">Reconnect to upload documents.</p>}
        <Submit>Upload document</Submit>
      </fieldset>
    </form>
  );
}
export function RemoveAttachment({ trip, id }: { trip: string; id: string }) {
  return (
    <form
      data-viewer-allowed
      action={deleteAttachment}
      onSubmit={(e) => {
        if (!window.confirm("Permanently remove this document?"))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="id" value={id} />
      <Button variant="danger">Remove document</Button>
    </form>
  );
}
