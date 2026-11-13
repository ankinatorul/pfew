"use client";
import { useRef, useEffect, useState, type ReactNode } from "react";
import {
  BedDouble,
  Plane,
  Ticket,
  MoreHorizontal,
  FileUp,
  PenLine,
} from "lucide-react";
import { BookingDrawer } from "./booking-drawer";
import { SimpleBookingFields } from "./simple-booking-fields";
import {
  simplifiedBookingFields,
  simpleBookingType,
  bookingSummary,
} from "../lib/simple-booking";
import type { CollectionEntry } from "../lib/booking-collection";
import type { Trip } from "../lib/domain";

export function BookingOptions({
  disabled,
  uploadDisabled = false,
  manualDisabled,
  onFiles,
  onManual,
}: {
  disabled: boolean;
  uploadDisabled?: boolean;
  manualDisabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  onManual: () => void;
}) {
  return (
    <fieldset
      className="collection-controls collection-options"
      disabled={disabled}
    >
      <BookingUploadArea
        disabled={disabled || uploadDisabled}
        onFiles={onFiles}
      />
      <button
        className="collection-manual-option"
        type="button"
        aria-label="Add manually"
        disabled={manualDisabled}
        onClick={onManual}
      >
        <PenLine size={30} aria-hidden="true" />
        <strong>Add manually</strong>
        <span>Enter a few details.</span>
      </button>
    </fieldset>
  );
}

export function BookingUploadArea({
  disabled = false,
  multiple = true,
  onFiles,
}: {
  disabled?: boolean;
  multiple?: boolean;
  onFiles?: (files: File[]) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className="collection-dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (onFiles) void onFiles(Array.from(event.dataTransfer.files));
        else if (
          input.current &&
          (multiple || event.dataTransfer.files.length === 1)
        )
          input.current.files = event.dataTransfer.files;
      }}
    >
      <FileUp size={30} aria-hidden="true" />
      <strong>
        {multiple ? "Drop your bookings here" : "Attach a confirmation"}
      </strong>
      <span>or browse files</span>
      <small>PDF, JPEG, PNG · up to 3 MB each</small>
      <input
        ref={input}
        type="file"
        name="file"
        disabled={disabled}
        multiple={multiple}
        required={!onFiles}
        accept="application/pdf,image/jpeg,image/png"
        aria-label={multiple ? "Upload confirmations" : "Attach confirmation"}
        onChange={(event) => {
          if (onFiles) {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            void onFiles(files);
          }
        }}
      />
    </label>
  );
}

export function BookingCard({
  entry,
  title,
  disabled,
  onOpen,
  children,
}: {
  entry: CollectionEntry;
  title: string;
  disabled?: boolean;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const type = simpleBookingType(entry.fields.category);
  const Icon =
    type === "Stay"
      ? BedDouble
      : type === "Transport"
        ? Plane
        : type === "Experience"
          ? Ticket
          : MoreHorizontal;
  const summary = bookingSummary(entry);
  return (
    <article
      className="create-card collection-entry compact-booking-card"
      aria-label={title}
    >
      <div className="section-top">
        <div>
          <span className="eyebrow">
            <Icon size={20} aria-hidden="true" />
          </span>
          <h2>
            <button
              type="button"
              className="booking-card-open"
              data-booking-open={entry.id}
              disabled={disabled}
              onClick={onOpen}
            >
              {title}
            </button>
          </h2>
        </div>
        {entry.review_status === "needs_review" && (
          <span className="pill" data-review-status={entry.review_status}>
            Needs review
          </span>
        )}
      </div>
      <p>
        {type}
        {summary.detail ? " · " + summary.detail : ""}
      </p>
      {summary.payment && <p>{summary.payment}</p>}
      {children}
    </article>
  );
}

export function BookingEditor({
  entry,
  trip,
  title,
  busy,
  disabled = false,
  error,
  paymentDueReady = false,
  confirmationHref,
  onClose,
  returnFocus,
  onChange,
  onSave,
  children,
}: {
  entry: CollectionEntry;
  trip: Trip;
  title: string;
  busy: boolean;
  disabled?: boolean;
  error: string;
  paymentDueReady?: boolean;
  confirmationHref?: string;
  onClose: () => void;
  returnFocus: HTMLElement | null;
  onChange: (fields: CollectionEntry["fields"]) => void;
  onSave: (fields: CollectionEntry["fields"]) => void | Promise<void>;
  children?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [validation, setValidation] = useState("");
  useEffect(() => {
    if (error || validation)
      form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [error, validation]);
  const fields = useRef(entry.fields);
  function snapshot() {
    const next = simplifiedBookingFields(
      { ...entry, fields: fields.current },
      Object.fromEntries(new FormData(form.current!)),
    );
    fields.current = next;
    return next;
  }
  return (
    <BookingDrawer
      title={title}
      busy={busy}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <form
        ref={form}
        aria-label="Booking editor"
        noValidate
        onChange={() => onChange(snapshot())}
        onSubmit={(event) => {
          event.preventDefault();
          const values = snapshot();
          if (!String(values.title || "").trim()) {
            setValidation("Give this booking a name.");
            return;
          }
          if (
            values.start_date &&
            values.end_date &&
            String(values.end_date) < String(values.start_date)
          ) {
            setValidation("End date must be on or after the start date.");
            return;
          }
          if (
            values.price !== "" &&
            values.price != null &&
            (!Number.isFinite(Number(values.price)) || Number(values.price) < 0)
          ) {
            setValidation("Enter a valid cost.");
            return;
          }
          setValidation("");
          if (!busy && !disabled) void onSave(values);
        }}
      >
        {(error || validation) && (
          <p className="booking-drawer-error" role="alert" tabIndex={-1}>
            {error || validation}
          </p>
        )}
        <fieldset disabled={disabled} inert={busy}>
          <SimpleBookingFields
            entry={entry}
            trip={trip}
            paymentDueReady={paymentDueReady}
            confirmationHref={confirmationHref}
            onLocationChange={(place, end) => {
              const prefix = end ? "end_" : "";
              fields.current = {
                ...snapshot(),
                [prefix + "location_id"]: place?.id || null,
                [prefix + "location_label"]: place?.label || null,
                [prefix + "latitude"]: place?.latitude ?? null,
                [prefix + "longitude"]: place?.longitude ?? null,
                ...(place
                  ? { [end ? "end_timezone" : "timezone"]: place.timezone }
                  : {}),
              };
              const zone = form.current?.elements.namedItem("timezone");
              if (!end && place && zone instanceof HTMLInputElement)
                zone.value = place.timezone;
              onChange(fields.current);
            }}
          />
          {children}
          <div className="actions">
            <button className="button primary" type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : title === "Add a booking"
                  ? "Save booking"
                  : "Save changes"}
            </button>
          </div>
        </fieldset>
      </form>
    </BookingDrawer>
  );
}
