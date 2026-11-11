"use client";
import { useRef, useState, useEffect } from "react";
import { BookingFields } from "./booking-fields";
import { useCreationFocus } from "../lib/use-creation-focus";
import { CreationProgress } from "./trip-basics";
import {
  collectionCounts,
  emptyCollectionEntry,
  COLLECTION_LIMIT,
  reservationStatuses,
  type CollectionEntry,
  type CollectionAttachment,
} from "../lib/booking-collection";
import type { Booking } from "../lib/essentials";
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
  segments = [],
  initialEntries,
  initialAttachments,
  ready = true,
  setupError = "",
  live = false,
  stepMode = true,
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
  request?: CollectionRequest;
  onNavigate?: (step: 1 | 3) => void;
  onRefresh?: () => void;
}) {
  const [entries, setEntries] = useState(initialEntries),
    [attachments, setAttachments] = useState(initialAttachments);
  const [dirty, setDirty] = useState<string[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [textEntry, setTextEntry] = useState<string | null>(null);
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
  const forms = useRef(new Map<string, HTMLFormElement>());
  const running = useRef(false);
  const pendingEditor = useRef<string | null>(null);
  const countsRef = useRef<HTMLParagraphElement>(null);
  const focusAfterRemoval = useRef(false);
  const actionFocus = useRef<{ element: HTMLElement; entryId: string } | null>(
    null,
  );
  const { headingRef, errorRef } = useCreationFocus(
    "bookings",
    error,
    !!busy,
    stepMode,
  );
  useEffect(() => {
    if (!stepMode || busy || error) return;
    if (pendingEditor.current) {
      const details = document.getElementById(
        "review-" + pendingEditor.current,
      ) as HTMLDetailsElement | null;
      if (details) {
        details.open = true;
        details.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
        pendingEditor.current = null;
        actionFocus.current = null;
        return;
      }
    }
    if (focusAfterRemoval.current) {
      countsRef.current?.focus();
      focusAfterRemoval.current = false;
      actionFocus.current = null;
      return;
    }
    const previous = actionFocus.current;
    actionFocus.current = null;
    if (previous?.element.isConnected)
      previous.element.focus({ preventScroll: true });
    else if (previous)
      document
        .getElementById("review-" + previous.entryId)
        ?.querySelector<HTMLElement>("summary")
        ?.focus({ preventScroll: true });
  }, [entries, busy, error, stepMode]);
  const counts = collectionCounts(entries);
  function put(entry: CollectionEntry) {
    setEntries((current) =>
      current.some((e) => e.id === entry.id)
        ? current.map((e) => (e.id === entry.id ? entry : e))
        : [...current, entry],
    );
  }
  function changed(id: string, form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    const fields = Object.fromEntries(
      Object.entries(values)
        .filter(([key]) => key !== "reservation_status")
        .map(([key, value]) => [key, typeof value === "string" ? value : ""]),
    );
    setEntries((current) =>
      current.map((e) =>
        e.id === id
          ? {
              ...e,
              fields,
              review_status: "needs_review",
              reservation_status:
                values.reservation_status as CollectionEntry["reservation_status"],
            }
          : e,
      ),
    );
    setDirty((current) => [...new Set([...current, id])]);
  }
  async function save(entry: CollectionEntry, reviewed = false) {
    const form = forms.current.get(entry.id),
      snapshot = form ? Object.fromEntries(new FormData(form)) : null;
    const fields = snapshot
      ? Object.fromEntries(
          Object.entries(snapshot)
            .filter(([key]) => key !== "reservation_status")
            .map(([key, value]) => [
              key,
              typeof value === "string" ? value : "",
            ]),
        )
      : entry.fields;
    const result = await request({
      action: "save",
      trip_id: trip.id,
      id: entry.id,
      revision: entry.revision,
      fields,
      review_status: reviewed ? "reviewed" : "needs_review",
      reservation_status:
        snapshot?.reservation_status || entry.reservation_status,
    });
    if (result.error) {
      setError(result.error);
      return null;
    }
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
    if (stepMode && document.activeElement instanceof HTMLElement)
      actionFocus.current = { element: document.activeElement, entryId: id };
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
      {stepMode && <CreationProgress step={2} />}
      <div className="create-intro">
        <span className="eyebrow">
          {stepMode ? "Step 2 of 3 · Optional" : "Saved booking drafts"}
        </span>
        {stepMode ? (
          <h1 ref={headingRef} tabIndex={-1}>
            Got bookings already?
          </h1>
        ) : (
          <h3>Booking details to review</h3>
        )}
        <p>
          Add your confirmations now, or skip this step and come back later.
        </p>
      </div>
      {!ready && (
        <p className="create-notice" role="status">
          {setupError ||
            "Booking collection is not available until the reviewed migrations are applied in a development database."}
        </p>
      )}
      <fieldset className="collection-controls" disabled={!ready || !!busy}>
        <label className="button primary collection-upload">
          Upload confirmations
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            aria-label="Upload confirmations"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              void perform("uploads", async () => {
                if (entries.length + files.length > COLLECTION_LIMIT) {
                  setError("Collect up to 20 booking entries at a time.");
                  return;
                }
                for (const file of files) {
                  const entry = emptyCollectionEntry(crypto.randomUUID());
                  rememberFile(entry.id, file);
                  put(entry);
                  await upload(entry, file);
                }
              });
            }}
          />
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={entries.length >= COLLECTION_LIMIT}
          onClick={() =>
            void perform("manual", async () => {
              const entry = emptyCollectionEntry(crypto.randomUUID());
              if (stepMode) pendingEditor.current = entry.id;
              put(entry);
              await save(entry);
            })
          }
        >
          Add manually
        </button>
        <p className="muted">
          PDF, JPEG or PNG · up to 3 MB each. Uploading keeps an original; it
          does not confirm a reservation.
        </p>
      </fieldset>
      <details className="collection-text">
        <summary>Paste confirmation text · no AI</summary>
        <label>
          Confirmation text
          <textarea
            maxLength={16000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={!!busy || !ready}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={
            !text.trim() ||
            !!busy ||
            !ready ||
            entries.length >= COLLECTION_LIMIT
          }
          onClick={() =>
            void perform("text", async () => {
              let entry = entries.find((e) => e.id === textEntry);
              if (!entry) {
                entry = emptyCollectionEntry(crypto.randomUUID());
                put(entry);
                setTextEntry(entry.id);
                entry = (await save(entry)) || undefined;
              }
              if (entry) await extract(entry, "text", text);
            })
          }
        >
          Read labeled text
        </button>
      </details>
      <p
        ref={countsRef}
        tabIndex={-1}
        className="collection-counts"
        role="status"
      >
        {counts.total} added · {counts.reviewed} reviewed · {counts.unfinished}{" "}
        need review
        {dirty.length ? ` · ${dirty.length} with unsaved changes` : ""}
      </p>
      {error && (
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
      {!entries.length && (
        <p className="collection-empty">
          No bookings added. You can continue without any.
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
          return (
            <article className="create-card collection-entry" key={entry.id}>
              <div className="section-top">
                <div>
                  <span className="eyebrow">
                    {known("category") || "Booking type not set"}
                  </span>
                  <h2>
                    {known("title") ||
                      known("provider") ||
                      entry.source?.filename ||
                      localFiles.get(entry.id)?.name ||
                      "Booking details"}
                  </h2>
                </div>
                <span className="pill" data-review-status={entry.review_status}>
                  {entry.review_status === "reviewed"
                    ? "Reviewed"
                    : "Needs review"}
                </span>
              </div>
              <p>
                {known("provider") || "Provider not entered"}
                {known("destination")
                  ? ` · ${known("destination")}`
                  : known("location_label")
                    ? ` · ${known("location_label")}`
                    : ""}
              </p>
              <p>
                {known("start_date")
                  ? `From ${known("start_date")} ${known("local_time")}`
                  : "Start date not entered"}
                {known("end_date")
                  ? ` · Until ${known("end_date")} ${known("end_local_time")}`
                  : " · End date not entered"}
              </p>
              <p className="muted">
                Reservation: {entry.reservation_status}. Reviewing details does
                not confirm a reservation.
              </p>
              {!saved && (
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
                  Unsaved changes · Continue will save these as Needs review.
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
              <div className="actions">
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
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy || !ready}
                  onClick={() => {
                    const details = document.getElementById(
                      "review-" + entry.id,
                    ) as HTMLDetailsElement | null;
                    if (details) {
                      details.open = true;
                      details
                        .querySelector<HTMLInputElement>('input[name="title"]')
                        ?.focus();
                    }
                  }}
                >
                  {entry.review_status === "reviewed"
                    ? "Edit"
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
              </div>
              {entry.extraction.status === "failed" && (
                <p className="create-notice">
                  Reading failed. Keep the reliable details and correct the rest
                  manually. Your stored original was not removed.
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
                      saved; enter details manually or paste labeled text above.
                      No paid request was made.
                    </p>
                  )}
                </details>
              )}
              <details id={"review-" + entry.id} className="collection-editor">
                <summary>
                  {entry.review_status === "reviewed"
                    ? "Edit booking details"
                    : "Review and correct details"}
                </summary>
                <form
                  key={entry.revision}
                  ref={(node) => {
                    if (node) forms.current.set(entry.id, node);
                    else forms.current.delete(entry.id);
                  }}
                  noValidate
                  onChange={(event) => changed(entry.id, event.currentTarget)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const reviewed =
                      (
                        event.nativeEvent as SubmitEvent
                      ).submitter?.getAttribute("value") === "reviewed";
                    void perform(entry.id, async () => {
                      await save(entry, reviewed);
                    });
                  }}
                >
                  <fieldset disabled={!ready || entry.removing} inert={!!busy}>
                    <BookingFields
                      trip={trip}
                      segments={segments}
                      draft={entry.fields as Partial<Booking>}
                      collection
                    />
                    <label>
                      Reservation status
                      <select
                        name="reservation_status"
                        defaultValue={entry.reservation_status}
                      >
                        {reservationStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted">
                      Leave unknown unless you know the actual reservation
                      status. Missing fields may stay unfinished.
                    </p>
                    <div className="actions">
                      <button className="button secondary" value="needs_review">
                        Save unfinished
                      </button>
                      <button className="button primary" value="reviewed">
                        Mark details reviewed
                      </button>
                    </div>
                  </fieldset>
                </form>
              </details>
            </article>
          );
        })}
      </div>
      {stepMode && (
        <div className="create-footer">
          <button
            className="button secondary"
            disabled={!ready || !!busy}
            onClick={() => void navigate(1)}
          >
            Back to Trip Basics
          </button>
          <div className="actions">
            <button
              className="button secondary"
              disabled={!ready || !!busy}
              onClick={() => void navigate(3)}
            >
              Skip for now
            </button>
            <button
              className="button primary"
              disabled={!ready || !!busy}
              onClick={() => void navigate(3)}
            >
              Continue
            </button>
          </div>
        </div>
      )}
      {stepMode && (
        <p className="muted">
          Bookings are optional. Needs review entries stay saved with your
          private draft when you continue. Unconfirmed uploads remain clearly
          marked.
        </p>
      )}
    </div>
  );
}
