"use client";
import { useState, useRef, type ReactNode, type ElementType } from "react";
import { FileText, Upload, FolderOpen } from "lucide-react";
import type { Trip } from "../lib/domain";
import {
  documentCategories,
  fileLabel,
  type TripFile,
  type ReadinessResult,
} from "../lib/packing-documents";
import { MoneyHeader } from "./booking-manager";
import { MAX_FILE_SIZE } from "../lib/files";
import { tripSectionUrl } from "../lib/trip-navigation";
export type DocumentRequest = (
  body: FormData | Record<string, unknown>,
) => Promise<ReadinessResult>;
export async function requestDocument(
  body: FormData | Record<string, unknown>,
) {
  const response = await fetch("/api/trip-documents", {
    method: "POST",
    cache: "no-store",
    ...(body instanceof FormData
      ? { body }
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  return response.json() as Promise<ReadinessResult>;
}
export type DocumentsProps = {
  trip: Trip;
  files: TripFile[];
  bookingNames: Record<string, string>;
  canEdit: boolean;
  ready: boolean;
  loadError?: string;
  reminders: ReactNode;
};
export function DocumentManager({
  trip,
  files,
  bookingNames,
  canEdit,
  ready,
  loadError,
  reminders,
  request = requestDocument,
  onRefresh,
  LinkComponent = "a",
}: DocumentsProps & {
  request?: DocumentRequest;
  onRefresh?: () => void;
  LinkComponent?: ElementType;
}) {
  const [upload, setUpload] = useState(false),
    [name, setName] = useState(""),
    [category, setCategory] = useState("Other"),
    [file, setFile] = useState<File | null>(null),
    [uploadId, setUploadId] = useState<string | null>(null),
    [editor, setEditor] = useState<{
      id: string;
      name: string;
      category: string;
      revision: number;
      hidden: boolean;
    } | null>(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [hidden, setHidden] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const guard = useRef(false),
    fileRef = useRef<HTMLInputElement>(null);
  async function run(
    body: FormData | Record<string, unknown>,
    close: false | "upload" | "editor" = false,
  ) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await request(body);
      if (result.error) {
        setError(result.error);
        onRefresh?.();
        return;
      }
      setMessage(result.message || "Saved.");
      if (close === "editor") setEditor(null);
      if (close === "upload") {
        setUpload(false);
        setFile(null);
        setName("");
        setUploadId(null);
        if (fileRef.current) fileRef.current.value = "";
      }
      onRefresh?.();
    } catch {
      setError(
        "Connection interrupted. Check the saved upload before retrying. Your original was not deleted.",
      );
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  function fileAction(f: TripFile, action: string) {
    return {
      trip_id: trip.id,
      id: f.id,
      action,
      revision: f.document_revision || 0,
    };
  }
  const visible = files.filter(
    (f) =>
      (hidden || !f.documents_hidden) &&
      (filter === "all" || (f.document_category || "Other") === filter) &&
      fileLabel(f).toLowerCase().includes(query.toLowerCase()),
  );
  if (loadError)
    return (
      <div className="trip-documents money-page readiness-page">
        <MoneyHeader
          trip={trip}
          view="documents"
          LinkComponent={LinkComponent}
        />
        <p role="alert" className="money-notice">
          {loadError}
        </p>
      </div>
    );
  return (
    <div className="trip-documents money-page readiness-page">
      <MoneyHeader trip={trip} view="documents" LinkComponent={LinkComponent} />
      <p className="money-muted">Only you can access your uploaded files.</p>
      {!ready && (
        <p className="money-notice">
          Existing confirmations are available. New uploads and organization
          need reviewed update 016.
        </p>
      )}
      <div className="money-toolbar">
        {canEdit && (
          <button
            className="button primary"
            disabled={!ready || pending}
            onClick={() => setUpload(!upload)}
          >
            <Upload size={17} /> Upload document
          </button>
        )}
        <LinkComponent href={tripSectionUrl(trip.id, "bookings")}>
          Booking confirmations →
        </LinkComponent>
      </div>
      {error && (
        <p className="money-notice money-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p role="status" className="money-muted">
          Saving your document…
        </p>
      )}
      {message && !pending && (
        <p role="status" className="money-muted">
          {message}
        </p>
      )}
      {upload && (
        <form
          className="money-card document-upload"
          aria-label="Document upload"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file || file.size < 1 || file.size > MAX_FILE_SIZE) {
              setError("Choose a PDF, JPEG or PNG up to 3 MB.");
              return;
            }
            const id = uploadId || crypto.randomUUID();
            setUploadId(id);
            const form = new FormData();
            form.set("action", "upload");
            form.set("trip_id", trip.id);
            form.set("id", id);
            form.set("file", file);
            form.set("label", name.trim() || file.name);
            form.set("category", category);
            void run(form, "upload");
          }}
        >
          <h2>Add a private document</h2>
          <fieldset disabled={pending}>
            <label>
              PDF, JPEG or PNG · up to 3 MB
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  setFile(next);
                  if (!name && next) setName(next.name);
                }}
              />
            </label>
            <div className="money-form-grid">
              <label>
                Document name
                <input
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Use the filename"
                />
              </label>
              <label>
                Document category
                <select
                  aria-label="Document category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {documentCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="money-card-actions">
              <button className="button primary" disabled={pending}>
                {uploadId ? "Retry original upload" : "Save document"}
              </button>
              {uploadId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      { trip_id: trip.id, id: uploadId, action: "recover" },
                      "upload",
                    )
                  }
                >
                  Check saved upload
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => setUpload(false)}
              >
                Close
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {editor && (
        <form
          className="money-card"
          aria-label="Document editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              {
                trip_id: trip.id,
                id: editor.id,
                action: "metadata",
                revision: editor.revision,
                label: editor.name,
                category: editor.category,
                hidden: editor.hidden,
              },
              "editor",
            );
          }}
        >
          <h2>Organize document</h2>
          <fieldset disabled={pending}>
            <div className="money-form-grid">
              <label>
                Display name
                <input
                  required
                  maxLength={200}
                  value={editor.name}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  aria-label="Edit document category"
                  value={editor.category}
                  onChange={(e) =>
                    setEditor({ ...editor, category: e.target.value })
                  }
                >
                  {documentCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="money-card-actions">
              <button className="button primary" disabled={pending}>
                Save document name
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="document-filters">
        <label>
          Find a document
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
          />
        </label>
        <label>
          Filter document category
          <select
            aria-label="Filter document category"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {documentCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="packing-collapse">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />{" "}
          Show hidden shortcuts
        </label>
      </div>
      {!files.length ? (
        <section className="money-empty">
          <FolderOpen size={30} />
          <h2>A place for your important bits.</h2>
          <p>Upload a file or open a confirmation from Bookings.</p>
        </section>
      ) : !visible.length ? (
        <p className="money-notice">No documents match these filters.</p>
      ) : (
        <div className="document-grid">
          {visible.map((f) => (
            <article
              className="money-card document-card"
              key={f.id}
              aria-label={fileLabel(f)}
            >
              <span className="money-icon">
                <FileText size={20} />
              </span>
              <span className="money-badge">
                {f.document_kind === "trip"
                  ? "Trip document"
                  : "Booking confirmation"}
                {f.documents_hidden ? " · Hidden shortcut" : ""}
              </span>
              <h2>{fileLabel(f)}</h2>
              <p className="money-muted">
                {f.document_category || "Other"} ·{" "}
                {f.content_type === "application/pdf"
                  ? "PDF"
                  : f.content_type === "image/png"
                    ? "PNG"
                    : "JPEG"}{" "}
                · {Math.ceil(f.size / 1024)} KB
              </p>
              <p className="money-muted">
                Uploaded {f.created_at.slice(0, 10)} · {trip.name}
              </p>
              {f.booking_id && (
                <p className="money-muted">
                  {bookingNames[f.booking_id] || "Related booking"}
                </p>
              )}
              {!f.booking_id && f.intake_id && (
                <p className="money-muted">Unfinished booking entry</p>
              )}
              {f.state === "pending" && (
                <p className="money-notice">Upload not confirmed.</p>
              )}
              <div className="money-card-actions">
                {f.state === "ready" && (
                  <a className="button" href={"/api/attachments/" + f.id}>
                    Open / download
                  </a>
                )}
                {ready && (
                  <>
                    <button
                      disabled={pending}
                      onClick={() =>
                        setEditor({
                          id: f.id,
                          name: fileLabel(f),
                          category: f.document_category || "Other",
                          revision: f.document_revision || 0,
                          hidden: !!f.documents_hidden,
                        })
                      }
                    >
                      Rename / organize
                    </button>
                    {f.document_kind === "trip" ? (
                      <>
                        <button
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this private document and its stored file? Bookings, reminders and other files stay saved.",
                              )
                            )
                              void run(fileAction(f, "delete"));
                          }}
                        >
                          Delete document
                        </button>
                        {f.state === "pending" && (
                          <>
                            <button
                              disabled={pending}
                              onClick={() =>
                                void run({
                                  trip_id: trip.id,
                                  id: f.id,
                                  action: "recover",
                                })
                              }
                            >
                              Check saved upload
                            </button>
                            <label className="button">
                              Retry original file
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                className="readiness-file-input"
                                disabled={pending}
                                onChange={(e) => {
                                  const retry = e.target.files?.[0];
                                  if (!retry) return;
                                  const form = new FormData();
                                  form.set("trip_id", trip.id);
                                  form.set("id", f.id);
                                  form.set("action", "upload");
                                  form.set("file", retry);
                                  void run(form);
                                }}
                              />
                            </label>
                          </>
                        )}
                      </>
                    ) : (
                      <button
                        disabled={pending}
                        onClick={() =>
                          void run({
                            ...fileAction(f, "metadata"),
                            label: fileLabel(f),
                            category: f.document_category || "Other",
                            hidden: !f.documents_hidden,
                          })
                        }
                      >
                        {f.documents_hidden
                          ? "Restore shortcut"
                          : "Hide from Documents"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {reminders}
    </div>
  );
}
