"use client";
import { useState, useRef } from "react";
import type { Trip, Segment } from "../lib/domain";
import {
  importResultSchema,
  importFieldNames,
  importLabels,
  bookingDraft,
  type ImportResult,
} from "../lib/booking-import-types";
import { BookingForm } from "./essentials/forms";
import { Button } from "./button";
export function BookingImport({
  trip,
  segments,
  live,
}: {
  trip: Trip;
  segments: Segment[];
  live: boolean;
}) {
  const [preview, setPreview] = useState<ImportResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("text");
  const formRef = useRef<HTMLFormElement>(null);
  async function extract(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/booking-import", {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Import unavailable.");
      setPreview(importResultSchema.parse(result));
      formRef.current?.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Import unavailable.");
    } finally {
      setBusy(false);
    }
  }
  if (preview)
    return (
      <section>
        <span className="eyebrow">
          Private import preview · nothing saved yet
        </span>
        <h2>Read it once. Check it twice.</h2>
        <p>
          {preview.method === "ai"
            ? "AI-extracted values are unverified."
            : "These values were read from explicit labels."}{" "}
          Missing or ambiguous information stays unknown. Nothing becomes a
          reservation automatically.
        </p>
        <details>
          <summary>Extracted, unknown and source evidence</summary>
          <div className="import-evidence">
            {importFieldNames.map((key) => (
              <div className="card" key={key}>
                <strong>{importLabels[key]}</strong>
                <p>
                  {preview.fields[key] === null
                    ? "Unknown"
                    : String(preview.fields[key]) +
                      " · extracted, not yet confirmed"}
                </p>
                {preview.evidence[key] && (
                  <blockquote>{preview.evidence[key]}</blockquote>
                )}
              </div>
            ))}
          </div>
        </details>
        {preview.warnings.map((warning, index) => (
          <p className="muted" key={index}>
            {warning}
          </p>
        ))}
        <Button
          variant="secondary"
          onClick={() => {
            setPreview(null);
            setError("");
          }}
        >
          Discard preview / start again
        </Button>
        <BookingForm
          key={preview.importKey}
          trip={trip}
          segments={segments}
          draft={bookingDraft(preview)}
          review={{ importKey: preview.importKey, method: preview.method }}
        />
      </section>
    );
  return (
    <section className="card">
      <span className="eyebrow">Smart Add · booking import</span>
      <h2>Less copying. More checking.</h2>
      <p>
        Paste a confirmation to preview its details. Labeled text works without
        AI; it reads fields such as “Provider:”, “Booking reference:” and “Start
        date: 2027-05-01”. You review and correct everything before saving.
      </p>
      <p className="muted">
        The preview is private and temporary. Approved booking fields are shared
        with trip members. Original files are not stored by this import; you can
        attach a private copy separately in Bookings.
      </p>
      <form ref={formRef} action={extract} className="form">
        <fieldset disabled={busy}>
          <input type="hidden" name="trip_id" value={trip.id} />
          <label>
            Read with
            <select
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="text">Labeled text · no AI provider</option>
              {live && (
                <option value="ai">
                  AI-assisted text or document · request budget applies
                </option>
              )}
            </select>
          </label>
          <label>
            Booking confirmation text
            <textarea
              name="text"
              maxLength={16000}
              rows={9}
              required={mode === "text"}
              placeholder={
                "Booking name: My flight\nProvider: …\nBooking reference: …\nStart date: YYYY-MM-DD\nCurrency: EUR"
              }
            />
          </label>
          {mode === "ai" && (
            <>
              <label>
                Or one PDF / image
                <input
                  type="file"
                  name="file"
                  accept="application/pdf,image/jpeg,image/png"
                />
              </label>
              <p className="muted">
                Maximum 3 MB, five PDF pages or a 20-megapixel image. Remove
                unrelated personal data first.
              </p>
              <label>
                <input type="checkbox" name="consent" value="yes" required />
                Send this source to the configured AI provider to extract
                booking details. The provider’s data policies apply.
              </label>
            </>
          )}
          {!live && (
            <p className="muted">
              AI document reading is unavailable for this deployment. Pasted
              labeled text and manual booking entry work now.
            </p>
          )}
          <Button disabled={busy}>
            {busy ? "Reading source…" : "Preview booking details"}
          </Button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      </form>
    </section>
  );
}
