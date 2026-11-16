"use client";
import { useRef, useState } from "react";
import type { TripFile } from "../lib/packing-documents";
import type { CollaborationReply } from "../lib/collaboration";
export function FilePrivacyControl({
  file,
  tripId,
  userId,
  canEdit,
  ready,
  request,
  onRefresh,
}: {
  file: TripFile;
  tripId: string;
  userId?: string;
  canEdit: boolean;
  ready: boolean;
  request?: (form: FormData) => Promise<CollaborationReply>;
  onRefresh?: () => void;
}) {
  const [scope, setScope] = useState(file.file_scope || "private"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const running = useRef(false);
  const own = !!userId && file.owner_id === userId;
  const eligible =
    own &&
    canEdit &&
    file.document_category !== "Passport & ID" &&
    file.state === "ready" &&
    (!file.intake_id || !!file.booking_id);
  async function change() {
    if (running.current || !request) return;
    const wanted = scope === "private" ? "shared" : "private";
    if (
      wanted === "shared" &&
      !window.confirm(
        `Share “${file.display_name || file.filename}” with people on this trip? Only share files you intend them to see.`,
      )
    )
      return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData();
    form.set("trip_id", tripId);
    form.set("id", file.id);
    form.set("revision", String(file.document_revision || 0));
    form.set("operation", "scope");
    form.set("scope", wanted);
    try {
      const result = await request(form);
      if (result.error) setError(result.error);
      else {
        setScope(wanted);
        setMessage("Privacy saved.");
        onRefresh?.();
      }
    } catch {
      setError("Couldn’t confirm privacy. Refresh before retrying.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="file-privacy">
      <span
        className={`sharing-tag ${scope === "shared" ? "sharing-tag-shared" : ""}`}
      >
        {scope === "shared" ? "Shared with trip" : "Private"}
      </span>
      {eligible && (
        <button
          type="button"
          className="button"
          disabled={!ready || !request || busy}
          onClick={() => void change()}
        >
          {busy
            ? "Saving…"
            : scope === "shared"
              ? "Make private"
              : "Share with trip"}
        </button>
      )}
      {eligible && !ready && <small>Sharing isn’t available yet.</small>}
      {file.document_category === "Passport & ID" && own && (
        <small>Passport &amp; ID stays private.</small>
      )}
      {error && (
        <p role="alert" className="sharing-error">
          {error}
        </p>
      )}
      <span role="status">{message}</span>
    </div>
  );
}
