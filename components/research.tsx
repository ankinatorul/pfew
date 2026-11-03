"use client";
import Link from "next/link";
import { useState, useRef, useActionState } from "react";
import { z } from "zod";
import type { Trip, Segment } from "../lib/domain";
import {
  sourcesForLocation,
  type OfficialSource,
} from "../lib/research-catalog";
import {
  researchContextSchema,
  researchStaleness,
  type ResearchContext,
  type ResearchNote,
} from "../lib/research-types";
import {
  saveResearchNote,
  removeResearchNote,
  researchToPrep,
  type ResearchSaveState,
} from "../app/research-actions";
import { Button } from "./button";
import { Submit } from "./forms";
const previewSchema = z.object({
  source: z.object({
    id: z.string(),
    name: z.string(),
    url: z.url().refine((url) => new URL(url).protocol === "https:"),
    country: z.string(),
    scope: z.string(),
  }),
  text: z.string().min(100).max(18000),
  retrievedAt: z.iso.datetime(),
});
type Preview = z.infer<typeof previewSchema>;
function SaveResearch({
  preview,
  tripId,
  destinationId,
  context,
}: {
  preview: Preview;
  tripId: string;
  destinationId: string;
  context: ResearchContext;
}) {
  const [state, save, pending] = useActionState(
      saveResearchNote,
      {} as ResearchSaveState,
    ),
    [excerpt, setExcerpt] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);
  return (
    <section className="card">
      <h3>{preview.source.name}</h3>
      <p>{preview.source.scope}</p>
      <a href={preview.source.url} target="_blank" rel="noopener noreferrer">
        Read the full official page ↗
      </a>
      <p className="muted">
        Retrieved {new Date(preview.retrievedAt).toLocaleString()}. Retrieval
        does not verify that this guidance applies to your circumstances. The
        preview may omit tables or interactive content.
      </p>
      <label>
        Official source text
        <textarea readOnly ref={text} value={preview.text} rows={12} />
      </label>
      <Button
        variant="secondary"
        onClick={() => {
          const field = text.current;
          if (field)
            setExcerpt(
              field.value
                .slice(field.selectionStart, field.selectionEnd)
                .slice(0, 1200),
            );
        }}
      >
        Use selected passage · up to 1,200 characters
      </Button>
      <form action={save} className="form">
        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="destination_id" value={destinationId} />
        <input type="hidden" name="source_id" value={preview.source.id} />
        {Object.entries(context).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label>
          Research note title
          <input
            name="title"
            required
            maxLength={160}
            placeholder="Something to check before departure"
          />
        </label>
        <label>
          Exact source excerpt
          <textarea
            name="source_excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            minLength={15}
            maxLength={1200}
            required
            rows={5}
          />
        </label>
        <label>
          Your note · optional
          <textarea name="note" maxLength={1500} rows={3} />
        </label>
        <p className="muted">
          The source will be fetched again when you save so the excerpt can be
          matched to the current page. This uses another request from your daily
          allowance.
        </p>
        <label>
          <input type="checkbox" name="reviewed" value="yes" required />I
          reviewed this source and approve sharing this excerpt, note,
          nationality and document context with trip members. This is not an
          automated visa or entry decision.
        </label>
        <Button disabled={pending || state.success}>
          {pending
            ? "Rechecking source…"
            : state.success
              ? "Research note saved"
              : "Recheck source & save note"}
        </Button>
        {state.error && (
          <p role="alert" className="error">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status">
            Saved below. You can add a Prep task when you are ready.
          </p>
        )}
      </form>
    </section>
  );
}
function RemoveNote({ record }: { record: ResearchNote }) {
  return (
    <form
      action={removeResearchNote}
      onSubmit={(event) => {
        if (
          !confirm("Remove this source note? Existing Prep tasks will remain.")
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="trip_id" value={record.trip_id} />
      <input type="hidden" name="id" value={record.id} />
      <Button variant="danger">Remove note</Button>
    </form>
  );
}
export function Research({
  trip,
  destinations,
  notes,
  canEdit,
}: {
  trip: Trip;
  destinations: Segment[];
  notes: ResearchNote[];
  canEdit: boolean;
}) {
  const [destinationId, setDestinationId] = useState(destinations[0]?.id || ""),
    [sourceId, setSourceId] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [context, setContext] = useState<ResearchContext | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sources = sourcesForLocation(
      destinations.find((item) => item.id === destinationId)?.location_id,
    ),
    source: OfficialSource | undefined =
      sources.find((item) => item.id === sourceId) || sources[0];
  async function research(form: FormData) {
    setBusy(true);
    setError("");
    setPreview(null);
    const input = researchContextSchema.safeParse(Object.fromEntries(form));
    if (!input.success) {
      setError("Enter nationality, document, purpose and valid travel dates.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: trip.id,
          destination_id: destinationId,
          source_id: source?.id,
          context: input.data,
        }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Source unavailable.");
      setPreview(previewSchema.parse(result));
      setContext(input.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Source unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="eyebrow">Official-source research</span>
      <h2>A little clarity before you go.</h2>
      <p>
        Read destination guidance, save an exact source excerpt, and decide what
        needs a Prep task. A saved note is not a guarantee of entry or a
        determination of visa eligibility.
      </p>
      {canEdit && (
        <section className="card">
          <h3>Start with the right context.</h3>
          <p className="muted">
            These inputs remain private until you explicitly save a shared
            source note. Do not enter passport numbers or upload identity
            documents.
          </p>
          <form action={research} className="form">
            <fieldset disabled={busy}>
              <label>
                Destination
                <select
                  value={destinationId}
                  onChange={(event) => {
                    setDestinationId(event.target.value);
                    setSourceId("");
                    setPreview(null);
                    setError("");
                  }}
                  required
                >
                  {!destinations.length && (
                    <option value="">Add a destination first</option>
                  )}
                  {destinations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Official source
                <select
                  value={source?.id || ""}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setPreview(null);
                  }}
                  required
                >
                  {!sources.length && (
                    <option value="">
                      No supported source for this destination
                    </option>
                  )}
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {source ? (
                <>
                  <p>{source.scope}</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open official website ↗
                  </a>
                </>
              ) : (
                <p className="muted">
                  Choose a city for this destination. The source catalog
                  currently covers selected countries; no source or entry rule
                  is invented for unsupported destinations.
                </p>
              )}
              <div className="two">
                <label>
                  Nationality
                  <input
                    name="nationality"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Nationality on the travel document"
                  />
                </label>
                <label>
                  Travel document
                  <select name="document">
                    <option value="ordinary passport">Ordinary passport</option>
                    <option value="identity card">Identity card</option>
                    <option value="other travel document">
                      Other travel document
                    </option>
                  </select>
                </label>
              </div>
              <label>
                Visit purpose
                <select name="purpose">
                  <option>tourism</option>
                  <option>business</option>
                  <option>transit</option>
                  <option>other</option>
                </select>
              </label>
              <div className="two">
                <label>
                  Travel starts
                  <input
                    type="date"
                    name="travel_start"
                    defaultValue={trip.start_date}
                    required
                  />
                </label>
                <label>
                  Travel ends
                  <input
                    type="date"
                    name="travel_end"
                    defaultValue={trip.end_date}
                    required
                  />
                </label>
              </div>
              <Button disabled={busy || !source}>
                {busy ? "Reading official source…" : "Preview official source"}
              </Button>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </fieldset>
          </form>
        </section>
      )}
      {preview && context && (
        <SaveResearch
          key={preview.source.id + preview.retrievedAt}
          preview={preview}
          tripId={trip.id}
          destinationId={destinationId}
          context={context}
        />
      )}
      <h2>Your saved research</h2>
      {!notes.length && (
        <div className="empty">
          No source notes saved yet. Existing custom Prep tasks remain
          available.
        </div>
      )}
      <div className="grid">
        {notes.map((record) => {
          const stale = researchStaleness(record, trip);
          return (
            <article className="card" key={record.id}>
              <span className="pill">
                Official-source excerpt · user reviewed
              </span>
              <h3>{record.title}</h3>
              <p>{record.destination_label}</p>
              <blockquote>{record.source_excerpt}</blockquote>
              {record.note && <p className="notes">Your note: {record.note}</p>}
              <a
                href={record.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {record.source_name} ↗
              </a>
              <p className="muted">
                Retrieved{" "}
                {new Date(record.retrieved_at).toLocaleString("en", {
                  timeZone: trip.timezone,
                })}
                ; reviewed{" "}
                {new Date(record.reviewed_at).toLocaleString("en", {
                  timeZone: trip.timezone,
                })}
                . No automated eligibility verification.
              </p>
              <p className="muted">
                {record.context.nationality} · {record.context.document} ·{" "}
                {record.context.purpose} · {record.context.travel_start} →{" "}
                {record.context.travel_end}
              </p>
              {stale && (
                <p className="notice" role="status">
                  {stale}
                </p>
              )}
              {canEdit && (
                <>
                  <form action={researchToPrep} className="form">
                    <input type="hidden" name="trip_id" value={trip.id} />
                    <input type="hidden" name="id" value={record.id} />
                    <label>
                      Prep task to add
                      <input
                        name="title"
                        required
                        maxLength={200}
                        placeholder="Check whether this guidance applies to me"
                      />
                    </label>
                    <label>
                      Due date · optional
                      <input name="due_date" type="date" />
                    </label>
                    <Submit>Add one Prep task</Submit>
                    <p className="muted">
                      Adding the same note again opens its existing task. No
                      action is marked mandatory automatically.
                    </p>
                  </form>
                  <RemoveNote record={record} />
                </>
              )}
            </article>
          );
        })}
      </div>
      <Link href={"/trips/" + trip.id + "?view=prep"}>Open Prep ↗</Link>
    </>
  );
}
