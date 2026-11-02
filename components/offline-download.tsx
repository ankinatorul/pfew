"use client";
import { useState, useEffect } from "react";
import {
  listSnapshots,
  encryptSnapshot,
  saveSnapshot,
  encodeDocument,
} from "../public/offline-store.js";
import { Button } from "./button";
type Document = {
  id: string;
  filename: string;
  size: number;
  content_type: string;
};
export function OfflineDownload({
  tripId,
  userId,
  documents,
}: {
  tripId: string;
  userId: string;
  documents: Document[];
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listSnapshots()
      .then((copies) => {
        if (!cancelled)
          setSavedAt(
            copies.find((copy) => copy.id === userId + ":" + tripId)?.savedAt ||
              null,
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, tripId]);
  async function download(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error("Reconnect to refresh your download.");
      if (!("serviceWorker" in navigator))
        throw new Error("This browser cannot prepare the offline reader.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      // Verify the static reader is cached before claiming it is ready offline.
      const shell = await caches.match("/offline.html");
      if (!shell)
        throw new Error(
          "The offline reader is still preparing. Try again in a moment.",
        );
      const password = String(form.get("passphrase") || "");
      const selected = form.getAll("document").map(String);
      if (selected.length > 3)
        throw new Error("Choose at most three documents per download.");
      const response = await fetch("/api/trips/" + tripId + "/offline", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Could not download this trip. Check your access and connection.",
        );
      const snapshot = await response.json();
      const files = [];
      for (const id of selected) {
        const meta = documents.find((item) => item.id === id);
        if (!meta) throw new Error("Document unavailable.");
        const file = await fetch("/api/attachments/" + id, {
          cache: "no-store",
        });
        if (!file.ok)
          throw new Error(
            "Could not download " +
              meta.filename +
              ". Refresh the page and retry.",
          );
        const blob = await file.blob();
        if (
          blob.size > 3145728 ||
          !["application/pdf", "image/jpeg", "image/png"].includes(
            blob.type.split(";")[0],
          )
        )
          throw new Error("Unsupported document.");
        files.push({
          filename: meta.filename,
          content_type: meta.content_type,
          data: await encodeDocument(blob),
        });
      }
      const envelope = await encryptSnapshot(
        { ...snapshot, documents: files },
        password,
      );
      await saveSnapshot(snapshot.userId, tripId, envelope);
      setSavedAt(new Date().toISOString());
      setMessage(
        "Encrypted download saved on this browser. Open the offline reader to check it. Keep your passphrase: it cannot be recovered.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Download could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Take a read-only copy with you.</h2>
      <p className="pill">
        {savedAt
          ? "Available offline on this browser · refreshed " +
            new Date(savedAt).toLocaleString()
          : "No offline copy detected on this browser"}
      </p>
      <p>
        Download your itinerary, bookings, checklists and recorded budget to
        this browser. Your copy stays unchanged until you download again. Maps
        and AI need a connection.
      </p>
      <p className="muted">
        This is optional. Your trip and selected private documents are encrypted
        with a separate passphrase. Nothing can be edited offline. A removed
        collaborator can retain a previously downloaded copy. Signing out keeps
        encrypted downloads until you remove them in the reader.
      </p>
      <form data-viewer-allowed action={download} className="form">
        <label>
          Download passphrase
          <input
            name="passphrase"
            type="password"
            minLength={10}
            maxLength={1000}
            autoComplete="off"
            required
            placeholder="At least 10 characters"
          />
        </label>
        <fieldset>
          <legend>Your private documents · optional · choose up to 3</legend>
          {!documents.length && (
            <p>No completed private uploads in this trip.</p>
          )}
          {documents.map((file) => (
            <label key={file.id}>
              <input type="checkbox" name="document" value={file.id} />
              {file.filename} · {Math.ceil(file.size / 1024)} KB
            </label>
          ))}
        </fieldset>
        <Button disabled={busy}>
          {busy ? "Encrypting download…" : "Download / refresh this trip"}
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
      <a className="button secondary" href="/offline.html">
        Open offline reader
      </a>
    </section>
  );
}
