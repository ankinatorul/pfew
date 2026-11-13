"use client";
import { useRef, useState, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";
import { BookingEditor, BookingOptions, BookingCard } from "./shared-booking";
import { useCreationFocus } from "../lib/use-creation-focus";
import { CreationProgress, CreationBack } from "./trip-basics";
import {
  collectionCounts,
  reviewedBookingFields,
  emptyCollectionEntry,
  COLLECTION_LIMIT,
  type CollectionEntry,
  type CollectionAttachment,
} from "../lib/booking-collection";
import type { Trip, Segment } from "../lib/domain";

export type CollectionReply = {
  entry?: CollectionEntry;
  attachment?: CollectionAttachment;
  error?: string;
  removed?: string;
  materialized?: boolean;
  advanced?: boolean;
};
export type CollectionRequest = (
  body: FormData | Record<string, unknown>,
  extract?: boolean,
) => Promise<CollectionReply>;
export async function requestCollection(
  body: FormData | Record<string, unknown>,
  extract = false,
): Promise<CollectionReply> {
  const response = await fetch(
    extract ? "/api/booking-import" : "/api/booking-collection",
    {
      method: "POST",
      cache: "no-store",
      ...(body instanceof FormData
        ? { body }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    },
  );
  const result = await response.json();
  if (!response.ok && !result.error)
    return {
      error:
        "The request could not be confirmed. Retry safely; your saved entries remain.",
    };
  return result;
}
export function BookingCollection({
  trip,
  initialEntries,
  initialAttachments,
  ready = true,
  setupError = "",
  live = false,
  stepMode = true,
  paymentDueReady = false,
  request = requestCollection,
  onNavigate,
  onRefresh,
}: {
  trip: Trip;
  segments?: Segment[];
  initialEntries: CollectionEntry[];
  initialAttachments: CollectionAttachment[];
  ready?: boolean;
  setupError?: string;
  live?: boolean;
  stepMode?: boolean;
  paymentDueReady?: boolean;
  request?: CollectionRequest;
  onNavigate?: (step: 1 | 3) => void;
  onRefresh?: () => void;
}) {
  const [entries, setEntries] = useState(initialEntries),
    [attachments, setAttachments] = useState(initialAttachments);
  const [dirty, setDirty] = useState<string[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [localFiles, setLocalFiles] = useState(() => new Map<string, File>());
  function rememberFile(id: string, file: File) {
    setLocalFiles((current) => new Map(current).set(id, file));
  }
  function forgetFile(id: string) {
    setLocalFiles((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }
  const running = useRef(false);
  const [editor, setEditor] = useState<{
    id: string;
    isNew: boolean;
    returnFocus: HTMLElement | null;
  } | null>(null);
  const editorRef = useRef<string | null>(null);
  function openEditor(entry: CollectionEntry, isNew = false) {
    if (editorRef.current || running.current) return;
    editorRef.current = entry.id;
    document
      .querySelector<HTMLElement>(`[data-booking-open="${entry.id}"]`)
      ?.closest("article")
      ?.querySelectorAll<HTMLDetailsElement>("details:not(.booking-card-menu)")
      .forEach((details) => {
        details.open = false;
      });
    const active = document.activeElement;
    const returnFocus =
      active instanceof HTMLElement && active !== document.body
        ? active
        : document.querySelector<HTMLElement>(
            `[data-booking-open="${entry.id}"]`,
          );
    setError("");
    setEditor({ id: entry.id, isNew, returnFocus });
  }
  function closeEditor(force = false) {
    if (!editor || (!force && running.current)) return;
    if (
      !force &&
      dirty.includes(editor.id) &&
      !window.confirm(
        stepMode
          ? "Close without saving? Your changes stay on this page and will be saved when you continue."
          : "Close without saving? Your changes stay on this page. Reopen this booking to save them.",
      )
    )
      return;
    if (!force && editor.isNew && !dirty.includes(editor.id))
      setEntries((current) =>
        current.filter((e) => e.id !== editor.id || e.revision > 0),
      );
    editorRef.current = null;
    setEditor(null);
    setError("");
  }
  const countsRef = useRef<HTMLParagraphElement>(null);
  const focusAfterRemoval = useRef(false);
  const { headingRef, errorRef } = useCreationFocus(
    "bookings",
    error,
    !!busy,
    stepMode,
  );
  useEffect(() => {
    if (!stepMode || busy || error) return;
    if (editor) return;
    if (focusAfterRemoval.current) {
      countsRef.current?.focus();
      focusAfterRemoval.current = false;
      return;
    }
  }, [entries, busy, error, stepMode, editor]);
  useEffect(() => {
    if (!dirty.length) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty.length, stepMode]);
  const counts = collectionCounts(entries);
  function put(entry: CollectionEntry) {
    setEntries((current) =>
      current.some((e) => e.id === entry.id)
        ? current.map((e) => (e.id === entry.id ? entry : e))
        : [...current, entry],
    );
  }
  async function save(
    entry: CollectionEntry,
    reviewed = false,
    updated?: CollectionEntry["fields"],
  ) {
    const fields = updated || entry.fields;
    if (reviewed) {
      if (!String(fields.title || "").trim()) {
        setError("Give this booking a name.");
        return null;
      }
      // Unknown scheduling stays in the existing unfinished collection. Never
      // weaken normal-booking constraints or substitute the trip dates.
      if (!reviewedBookingFields(fields, trip.id).success) reviewed = false;
    }
    const result = await request({
      action: "save",
      trip_id: trip.id,
      id: entry.id,
      revision: entry.revision,
      fields,
      review_status: reviewed ? "reviewed" : "needs_review",
      reservation_status: entry.reservation_status,
    });
    if (result.error) {
      setError(result.error);
      return null;
    }
    if (!result.entry && !result.materialized) {
      setError("Couldn’t confirm the save. Try again.");
      return null;
    }
    if ((result.entry || result.materialized) && editorRef.current === entry.id)
      closeEditor(true);
    if (result.materialized) {
      setEntries((current) => current.filter((e) => e.id !== entry.id));
      onRefresh?.();
    } else if (result.entry) put(result.entry);
    setDirty((current) => current.filter((id) => id !== entry.id));
    return result.entry || null;
  }
  async function perform(id: string, operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(id);
    setError("");
    try {
      await operation();
    } catch {
      setError(
        "The request could not be confirmed. Your inputs are still here. Retry safely.",
      );
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  async function upload(entry: CollectionEntry, file?: File) {
    if (dirty.includes(entry.id)) {
      const saved = await save(entry);
      if (!saved) return;
      entry = saved;
    }
    const form = new FormData();
    form.set("action", file ? "upload" : "recover_upload");
    form.set("trip_id", trip.id);
    form.set("id", entry.id);
    form.set("revision", String(entry.revision));
    if (file) form.set("file", file);
    const result = await request(form);
    if (result.entry) put(result.entry);
    if (result.attachment)
      setAttachments((current) => [
        ...current.filter((a) => a.id !== result.attachment!.id),
        result.attachment!,
      ]);
    if (result.error) setError(result.error);
    else if (result.attachment) forgetFile(entry.id);
  }
  async function extract(
    entry: CollectionEntry,
    mode: "text" | "ai",
    sourceText = "",
  ) {
    if (dirty.includes(entry.id)) {
      const saved = await save(entry);
      if (!saved) return;
      entry = saved;
    }
    const form = new FormData();
    form.set("trip_id", trip.id);
    form.set("collection_entry_id", entry.id);
    form.set("revision", String(entry.revision));
    form.set("mode", mode);
    form.set("text", sourceText);
    if (mode === "ai") form.set("consent", "yes");
    const result = await request(form, true);
    if (result.entry) put(result.entry);
    if (result.error) setError(result.error);
  }
  async function addFiles(files: File[]) {
    await perform("uploads", async () => {
      if (entries.length + files.length > COLLECTION_LIMIT) {
        setError("Add up to 20 bookings.");
        return;
      }
      for (const file of files) {
        if (
          !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
          file.size > 3145728 ||
          !file.size
        ) {
          setError("Choose a PDF, JPEG or PNG up to 3 MB.");
          continue;
        }
        const entry = emptyCollectionEntry(crypto.randomUUID());
        rememberFile(entry.id, file);
        put(entry);
        await upload(entry, file);
      }
    });
  }
  async function navigate(step: 1 | 3) {
    await perform("navigation", async () => {
      for (const entry of entries.filter(
        (e) => dirty.includes(e.id) || e.revision === 0,
      )) {
        if (localFiles.has(entry.id) && !entry.source) {
          setError(
            "This file has not been stored. Retry its upload or remove the entry before leaving; no saved file is being claimed.",
          );
          return;
        }
        if (!(await save(entry))) return;
      }
      if (step === 3) {
        const result = await request({
          action: "advance",
          trip_id: trip.id,
          id: crypto.randomUUID(),
          revision: 0,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      onNavigate?.(step);
    });
  }
  return (
    <div className="booking-collection" aria-busy={!!busy}>
      {stepMode && (
        <>
          <CreationBack
            label="Back to Trip Basics"
            disabled={!!busy}
            onClick={() => void navigate(1)}
          />
          <CreationProgress step={2} />
        </>
      )}
      <div className="create-intro">
        {!stepMode && <span className="eyebrow">Saved booking drafts</span>}
        {stepMode ? (
          <h1 ref={headingRef} tabIndex={-1}>
            Add your bookings
          </h1>
        ) : (
          <h3>Booking details to review</h3>
        )}
        {!stepMode && <p>Add confirmations or enter details.</p>}
      </div>
      {!ready && (
        <p className="create-notice" role="status">
          {stepMode
            ? "Bookings are temporarily unavailable. Your saved details are unchanged."
            : setupError ||
              "Booking collection is temporarily unavailable. Your saved entries are unchanged."}
        </p>
      )}
      <BookingOptions
        disabled={!ready || !!busy}
        manualDisabled={entries.length >= COLLECTION_LIMIT}
        onFiles={addFiles}
        onManual={() => {
          if (editorRef.current || running.current) return;
          const entry = emptyCollectionEntry(crypto.randomUUID());
          put(entry);
          openEditor(entry, true);
        }}
      />
      <p ref={countsRef} tabIndex={-1} className="sr-only" role="status">
        {counts.total} added · {counts.reviewed} reviewed · {counts.unfinished}{" "}
        need review
        {dirty.length ? ` · ${dirty.length} with unsaved changes` : ""}
      </p>
      {error && !editor && (
        <p ref={errorRef} tabIndex={-1} className="create-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="muted" role="status">
          {busy === "uploads"
            ? "Saving your files one at a time…"
            : "Saving or checking your collection…"}
        </p>
      )}
      <div className="collection-review" aria-label="Grouped booking review">
        {entries.map((entry) => {
          const attachment = attachments.find(
            (a) => a.id === entry.source?.attachment_id,
          );
          const known = (key: string) =>
            entry.fields[key] === null || entry.fields[key] === undefined
              ? ""
              : String(entry.fields[key]);
          const saved = entry.revision > 0;
          const title =
            known("title") ||
            known("provider") ||
            entry.source?.filename ||
            localFiles.get(entry.id)?.name ||
            (stepMode ? "New booking" : "Booking details");
          return (
            <BookingCard
              key={entry.id}
              entry={entry}
              title={title}
              disabled={!!busy || !ready}
              onOpen={() => openEditor(entry)}
            >
              {!saved && editor?.id !== entry.id && (
                <p role="status">Not saved yet. Retry saving before leaving.</p>
              )}
              {entry.removing && (
                <p className="create-notice" role="status">
                  Removal is pending. Use Remove again to finish. The file may
                  already have been removed.
                </p>
              )}
              {dirty.includes(entry.id) && (
                <p className="muted">
                  {stepMode
                    ? "Unsaved changes"
                    : "Unsaved changes · Continue will save these as Needs review."}
                </p>
              )}
              {entry.source && (
                <p>
                  {attachment?.state === "ready" ? (
                    <a href={`/api/attachments/${entry.source.attachment_id}`}>
                      Open saved file: {entry.source.filename}
                    </a>
                  ) : (
                    <>File upload not confirmed: {entry.source.filename}</>
                  )}
                </p>
              )}
              <div className="collection-upload-recovery">
                {" "}
                {(localFiles.has(entry.id) ||
                  (entry.source && attachment?.state !== "ready")) && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!!busy || !ready}
                    onClick={() =>
                      void perform(entry.id, () =>
                        upload(entry, localFiles.get(entry.id)),
                      )
                    }
                  >
                    {localFiles.has(entry.id)
                      ? "Retry upload"
                      : "Check saved upload"}
                  </button>
                )}
                {entry.source &&
                  attachment?.state !== "ready" &&
                  !localFiles.has(entry.id) && (
                    <label className="button secondary">
                      Retry with original file
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        disabled={!!busy || !ready}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            rememberFile(entry.id, file);
                            void perform(entry.id, () => upload(entry, file));
                          }
                        }}
                      />
                    </label>
                  )}
              </div>
              <CollectionCardActions compact={true} title={title}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy || !ready}
                  onClick={() => openEditor(entry)}
                >
                  {entry.review_status === "reviewed"
                    ? "Edit"
                    : stepMode
                      ? "Review"
                      : "Review / edit"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy || !ready}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this entry and its private source file? This cannot be undone.",
                      )
                    )
                      void perform(entry.id, async () => {
                        let current = entry;
                        if (dirty.includes(entry.id)) {
                          const savedEntry = await save(entry);
                          if (!savedEntry) return;
                          current = savedEntry;
                        }
                        const result = await request({
                          action: "remove",
                          trip_id: trip.id,
                          id: entry.id,
                          revision: current.revision,
                        });
                        if (result.error) {
                          setError(result.error);
                          if (result.entry) put(result.entry);
                          return;
                        }
                        setEntries((current) =>
                          current.filter((e) => e.id !== entry.id),
                        );
                        setDirty((current) =>
                          current.filter((id) => id !== entry.id),
                        );
                        forgetFile(entry.id);
                        if (stepMode) focusAfterRemoval.current = true;
                        onRefresh?.();
                      });
                  }}
                >
                  Remove
                </button>
              </CollectionCardActions>
              {entry.extraction.status === "failed" && (
                <p className="create-notice">
                  Couldn’t read this file. Your original is saved. Review it
                  manually or retry.
                </p>
              )}
              {entry.extraction.warnings.map((warning, index) => (
                <p className="muted" key={index}>
                  {warning}
                </p>
              ))}
              {Object.keys(entry.extraction.evidence).length > 0 && (
                <details>
                  <summary>Source evidence</summary>
                  {Object.entries(entry.extraction.evidence).map(
                    ([key, value]) => (
                      <p key={key}>
                        <strong>{key.replaceAll("_", " ")}: </strong>
                        {value}
                      </p>
                    ),
                  )}
                </details>
              )}
              {entry.source && attachment?.state === "ready" && (
                <details>
                  <summary>Read or retry reading this saved file</summary>
                  {live ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void perform(entry.id, () => extract(entry, "ai"));
                      }}
                    >
                      <label>
                        <input type="checkbox" required /> Send this saved
                        source to the existing configured AI provider. Its data
                        policies and request budget apply.
                      </label>
                      <button
                        className="button secondary"
                        disabled={!!busy || !ready}
                      >
                        Read saved file
                      </button>
                    </form>
                  ) : (
                    <p>
                      AI document reading is not configured. The original is
                      saved; enter details manually. No paid request was made.
                    </p>
                  )}
                </details>
              )}
              {editor?.id === entry.id && (
                <BookingEditor
                  entry={entry}
                  trip={trip}
                  paymentDueReady={paymentDueReady}
                  title={
                    editor.isNew
                      ? "Add a booking"
                      : entry.source && entry.review_status === "needs_review"
                        ? "Review booking"
                        : "Edit booking"
                  }
                  busy={!!busy}
                  disabled={!ready || !!entry.removing}
                  error={error}
                  returnFocus={editor.returnFocus}
                  onClose={() => closeEditor()}
                  confirmationHref={
                    entry.source && attachment?.state === "ready"
                      ? `/api/attachments/${entry.source.attachment_id}`
                      : undefined
                  }
                  onChange={(fields) => {
                    put({ ...entry, fields, review_status: "needs_review" });
                    setDirty((current) => [...new Set([...current, entry.id])]);
                  }}
                  onSave={(fields) =>
                    perform(entry.id, async () => {
                      await save(entry, true, fields);
                    })
                  }
                />
              )}
            </BookingCard>
          );
        })}
      </div>
      {stepMode && (
        <div className="create-footer">
          <button
            className="button primary"
            disabled={!ready || !!busy}
            onClick={() => void navigate(3)}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

function CollectionCardActions({
  compact,
  title,
  children,
}: {
  compact: boolean;
  title: string;
  children: import("react").ReactNode;
}) {
  return compact ? (
    <details className="booking-card-menu">
      <summary aria-label={`More actions for ${title}`}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </summary>
      <div className="actions">{children}</div>
    </details>
  ) : (
    <div className="actions">{children}</div>
  );
}
