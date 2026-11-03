import { TravelNotes } from "./travel-notes";
import Link from "next/link";
import { access } from "../lib/access";
import type { Trip, Segment } from "../lib/domain";
import { visibleFinding, type Finding } from "../lib/trip-check";
import {
  runTripCheck,
  decideFinding,
  restoreFinding,
  generateSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  planIdea,
} from "../app/intelligence-actions";
import { Submit, Delete, SegmentForm } from "./forms";
import { Discovery, type SavedPlace } from "./discovery";
export async function Intelligence({
  trip,
  segments,
  view,
  canEdit = true,
  searchQuery,
}: {
  trip: Trip;
  segments: Segment[];
  view: string;
  canEdit?: boolean;
  searchQuery?: string;
}) {
  const { db } = await access();
  const base = "/trips/" + trip.id;
  const tables =
    view === "check"
      ? ["trip_check_findings", "finding_decisions", "trip_check_runs"]
      : view === "ideas"
        ? ["ai_suggestions"]
        : ["saved_places"];
  const result = await Promise.all(
    tables.map((t) => db.from(t).select("*").eq("trip_id", trip.id)),
  );
  if (
    result.some(
      (r) => r.error?.code === "PGRST205" || r.error?.code === "42P01",
    )
  )
    return (
      <section className="card">
        <h2>A little setup before discovery.</h2>
        <p>
          Run migration 006 in Supabase SQL Editor to enable Trip Check, Ideas
          and saved places.
        </p>
      </section>
    );
  if (result.some((r) => r.error))
    throw new Error("Could not load trip intelligence");
  const rows = Object.fromEntries(
    tables.map((t, i) => [t, result[i].data || []]),
  );
  if (view === "map")
    return (
      <Discovery
        trip={trip}
        segments={segments}
        places={rows.saved_places as SavedPlace[]}
        canEdit={canEdit}
        searchQuery={searchQuery}
      />
    );
  if (view === "check") {
    const findings = rows.trip_check_findings as (Finding & {
      id: string;
      active: boolean;
      checked_at: string;
    })[];
    const decisions = rows.finding_decisions as {
      finding_id: string;
      decision: string;
      remind_after: string | null;
    }[];
    const decision = (id: string) => decisions.find((d) => d.finding_id === id);
    const visible = findings.filter((f) =>
      visibleFinding(f.active, decision(f.id)),
    );
    const handled = findings.filter(
      (f) => f.active && !visibleFinding(f.active, decision(f.id)),
    );
    const last = rows.trip_check_runs[0] as
      { checked_at: string; finding_count: number } | undefined;
    return (
      <>
        <span className="eyebrow">Smart Trip Check</span>
        <h2>A second look. A little peace of mind.</h2>
        <p>
          Checks use your saved trip information. They do not verify
          reservations or official entry requirements.
        </p>
        <form action={runTripCheck}>
          <input type="hidden" name="trip_id" value={trip.id} />
          <Submit>{last ? "Run Trip Check again" : "Check my trip"}</Submit>
        </form>
        {last && (
          <p className="muted">
            Last checked{" "}
            {new Date(last.checked_at).toLocaleString("en", {
              timeZone: trip.timezone,
            })}{" "}
            · {trip.timezone}. Rerun after changing your plans.
          </p>
        )}
        <div className="grid">
          {visible.map((f) => (
            <article
              className={"card " + (f.priority === "attention" ? "pink" : "")}
              key={f.id}
            >
              <span className="pill">Observation · {f.priority}</span>
              <h3>{f.title}</h3>
              <p>{f.observation}</p>
              <p className="muted">{f.uncertainty}</p>
              <Link
                className="button secondary"
                href={base + "?view=" + f.action_view}
              >
                Add / review details ↗
              </Link>
              <form action={decideFinding} className="finding-actions">
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="finding_id" value={f.id} />
                {[
                  ["already_arranged", "Already arranged"],
                  ["not_needed", "Not needed"],
                  ["dismissed", "Dismiss"],
                  ["remind_later", "Remind in 24 hours"],
                ].map(([value, label]) => (
                  <button
                    className="button secondary"
                    name="decision"
                    value={value}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </form>
            </article>
          ))}
        </div>
        {last && !visible.length && (
          <section className="card lime">
            <h3>Nothing needs your attention in this saved check.</h3>
            <p>
              This is not a guarantee that every arrangement or travel
              requirement is complete.
            </p>
          </section>
        )}
        {handled.length > 0 && (
          <details>
            <summary>Handled or snoozed findings ({handled.length})</summary>
            {handled.map((f) => (
              <section className="card" key={f.id}>
                <h3>{f.title}</h3>
                <p className="muted">
                  {decision(f.id)?.decision.replaceAll("_", " ")}
                </p>
                <form action={restoreFinding}>
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input type="hidden" name="finding_id" value={f.id} />
                  <Submit>Show again</Submit>
                </form>
              </section>
            ))}
          </details>
        )}
      </>
    );
  }
  const suggestions = rows.ai_suggestions as {
    id: string;
    title: string;
    note: string;
    source: string;
    accepted_segment_id: string | null;
    dismissed: boolean;
    created_at: string;
  }[];
  const ideas = segments.filter((s) => s.status === "idea");
  const { data: usage, error: usageError } = await db.rpc(
    "service_budget_status",
  );
  const live =
    process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY);
  return (
    <>
      <span className="eyebrow">Ideas</span>
      <h2>Save a little possibility.</h2>
      <p>
        Ideas are unscheduled and are never reservations. Choose a day when
        you’re ready.
      </p>
      <div className="grid">
        {ideas.map((idea) => (
          <article className="card" key={idea.id}>
            <span className="pill">Saved idea</span>
            <h3>{idea.title}</h3>
            <TravelNotes text={idea.notes} />
            {idea.google_place_id && (
              <a
                href={
                  "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(idea.title) +
                  "&query_place_id=" +
                  encodeURIComponent(idea.google_place_id)
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                View Google place ↗
              </a>
            )}
            <form action={planIdea}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="id" value={idea.id} />
              <label>
                Add to day
                <input
                  name="day"
                  type="date"
                  min={trip.start_date}
                  max={trip.end_date}
                  defaultValue={trip.start_date}
                  required
                />
              </label>
              <label>
                Local time · optional
                <input name="local_time" type="time" />
              </label>
              <label>
                Duration · minutes, optional
                <input
                  name="duration_minutes"
                  type="number"
                  min="1"
                  max="1440"
                />
              </label>
              <Submit>Add to itinerary as a plan</Submit>
            </form>
            <div className="actions">
              <Link data-edit-action href={base + "?view=add&edit=" + idea.id}>
                Edit idea
              </Link>
              <Delete id={idea.id} tripId={trip.id} />
            </div>
          </article>
        ))}
      </div>
      {!ideas.length && (
        <div className="empty">
          No ideas saved yet. Keep a little inspiration here without filling
          every free hour.
        </div>
      )}
      <details>
        <summary>Save a manual idea</summary>
        <SegmentForm
          key="manual-idea"
          trip={trip}
          destinations={segments.filter((s) => s.kind === "destination")}
          initialStatus="idea"
        />
      </details>
      <section className="card">
        <h3>Contextual inspiration, when you ask.</h3>
        <p className="muted">
          {live
            ? "AI suggestions are unverified ideas for your review."
            : "Live AI is not configured. Sample mode demonstrates the workflow without paid calls or invented place facts."}
        </p>
        {!usageError && usage && (
          <p className="muted">
            Estimated service budget this month: $
            {(Number(usage.estimated_cents) / 100).toFixed(2)} / $
            {(Number(usage.monthly_limit_cents) / 100).toFixed(2)}. Charges are
            conservative request estimates, not provider invoices. Daily request
            limit: {usage.daily_user_requests}.
          </p>
        )}
        <form action={generateSuggestions} className="form">
          <input type="hidden" name="trip_id" value={trip.id} />
          <label>
            Destination
            <select name="destination_id">
              <option value="">Whole trip</option>
              {segments
                .filter((s) => s.kind === "destination")
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            What would help?
            <textarea
              name="request"
              required
              maxLength={500}
              placeholder="A relaxed arrival day, or ideas that fit my budget…"
            />
          </label>
          <label>
            Mode
            <select name="mode">
              <option value="mock">Sample mode · no paid calls</option>
              {live && (
                <option value="live">Live AI · estimated budget applies</option>
              )}
            </select>
          </label>
          <Submit>Suggest ideas for review</Submit>
        </form>
      </section>
      <div className="grid">
        {suggestions
          .filter((s) => !s.dismissed && !s.accepted_segment_id)
          .map((s) => (
            <article className="card" key={s.id}>
              <span className="pill">
                {s.source === "mock"
                  ? "Sample suggestion · mock"
                  : "AI suggestion · unverified"}
              </span>
              <h3>{s.title}</h3>
              <p>{s.note}</p>
              <p className="muted">
                No place, price, booking or availability has been verified.
              </p>
              <form action={acceptSuggestion}>
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="suggestion_id" value={s.id} />
                <Submit>Approve & save to Ideas</Submit>
              </form>
              <form action={dismissSuggestion}>
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="suggestion_id" value={s.id} />
                <button className="button secondary">Dismiss</button>
              </form>
            </article>
          ))}
      </div>
    </>
  );
}
