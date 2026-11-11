"use client";
import {
  useState,
  useSyncExternalStore,
  useRef,
  useEffect,
  useId,
} from "react";
import { ArrowDown, ArrowUp, Plus, X, LockKeyhole } from "lucide-react";
import { useCreationFocus } from "../lib/use-creation-focus";
import { LocationPicker } from "./location-picker";
import {
  tripBasicsSchema,
  draftBasics,
  type DraftSaveResult,
  type PrivateDraft,
} from "../lib/trip-drafts";
import {
  localBasicsList,
  parseLocalBasics,
  readLocalBasics,
  subscribeLocalBasics,
  writeLocalBasics,
  type LocalTripBasics,
} from "../lib/trip-draft-cache";

export function CreationProgress({ step = 1 }: { step?: number }) {
  return (
    <ol className="create-progress" aria-label="Create trip progress">
      {["Trip Basics", "Add Bookings", "Travel Style & Review"].map(
        (name, index) => (
          <li key={name} aria-current={index + 1 === step ? "step" : undefined}>
            <span>{index + 1}</span>
            {name}
          </li>
        ),
      )}
    </ol>
  );
}

export function TripBasicsForm(props: {
  userId: string;
  id: string;
  draft?: PrivateDraft;
  ready: boolean;
  save: (
    id: string,
    revision: number,
    input: unknown,
  ) => Promise<DraftSaveResult>;
  onSaved: (draft: PrivateDraft) => void;
}) {
  const hydrated = useSyncExternalStore(
    subscribeLocalBasics,
    () => true,
    () => false,
  );
  if (!hydrated) return <p role="status">Opening your trip basics…</p>;
  return <TripBasicsFields {...props} />;
}
function TripBasicsFields({
  userId,
  id,
  draft,
  ready,
  save,
  onSaved,
}: Parameters<typeof TripBasicsForm>[0]) {
  const initial = draft ? draftBasics(draft) : null;
  const localText = useSyncExternalStore(
    subscribeLocalBasics,
    () => readLocalBasics(userId, id),
    () => null,
  );
  const cached = parseLocalBasics(localText);
  const revision = draft?.draft_revision || 0;
  const [value, setValue] = useState<LocalTripBasics>(() =>
    cached && cached.revision === revision
      ? cached
      : {
          id,
          revision,
          name: initial?.name || "",
          start_date: initial?.start_date || "",
          end_date: initial?.end_date || "",
          updated_at: new Date().toISOString(),
          rows: initial?.destinations.map((location, index) => ({
            key: id + ":" + index,
            query: location.label,
            location,
          })) || [{ key: id + ":0", query: "", location: null }],
        },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const errorId = useId();
  const running = useRef(false);
  const destinationNodes = useRef(new Map<string, HTMLDivElement>());
  const pendingDestination = useRef<string | null>(null);
  const { headingRef, errorRef } = useCreationFocus("basics", error, busy);
  useEffect(() => {
    if (!pendingDestination.current) return;
    destinationNodes.current
      .get(pendingDestination.current)
      ?.querySelector<HTMLInputElement>('[role="combobox"]')
      ?.focus();
    pendingDestination.current = null;
  }, [value.rows]);
  const changedElsewhere = Boolean(cached && cached.revision > revision);
  function change(next: LocalTripBasics) {
    const updated = { ...next, updated_at: new Date().toISOString() };
    setValue(updated);
    setError("");
    setInvalidFields([]);
    setStorageError(!writeLocalBasics(userId, updated));
  }
  function move(index: number, by: number) {
    const rows = [...value.rows];
    [rows[index], rows[index + by]] = [rows[index + by], rows[index]];
    pendingDestination.current = value.rows[index].key;
    change({ ...value, rows });
  }
  return (
    <form
      className="trip-basics-form"
      aria-busy={busy}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (running.current) return;
        if (!navigator.onLine) {
          setError(
            "You’re offline. Your inputs stay in this browser. Reconnect to save your private draft.",
          );
          return;
        }
        if (value.rows.some((row) => !row.location)) {
          setInvalidFields(["destinations"]);
          setError(
            "Choose a destination from the results, or add its map position, for each destination.",
          );
          return;
        }
        const parsed = tripBasicsSchema.safeParse({
          name: value.name,
          destinations: value.rows.map((row) => row.location),
          start_date: value.start_date,
          end_date: value.end_date,
        });
        if (!parsed.success) {
          setInvalidFields(
            parsed.error.issues.map((issue) => String(issue.path[0])),
          );
          setError(parsed.error.issues.map((issue) => issue.message).join(" "));
          return;
        }
        running.current = true;
        setBusy(true);
        setError("");
        try {
          const result = await save(id, revision, parsed.data);
          if ("error" in result) setError(result.error);
          else {
            writeLocalBasics(userId, {
              ...value,
              revision: result.draft.draft_revision,
            });
            onSaved(result.draft);
          }
        } catch {
          setError(
            "Your draft could not be saved. Your inputs are still here. Try again.",
          );
        } finally {
          running.current = false;
          setBusy(false);
        }
      }}
    >
      <CreationProgress />
      <div className="create-intro">
        <span className="eyebrow">Step 1 of 3</span>
        <h1 ref={headingRef} tabIndex={-1}>
          Start with a little possibility.
        </h1>
        <p>A name, a place, and something to look forward to.</p>
      </div>
      <fieldset disabled={busy} className="create-fields">
        <section className="create-card" aria-labelledby="basics-name">
          <h2 id="basics-name">Your next adventure</h2>
          <label>
            Trip name <span className="muted">(required)</span>
            <input
              name="name"
              aria-invalid={invalidFields.includes("name") || undefined}
              aria-describedby={
                invalidFields.includes("name") ? errorId : undefined
              }
              required
              maxLength={120}
              value={value.name}
              onChange={(event) =>
                change({ ...value, name: event.target.value })
              }
              placeholder="What will you call it?"
              autoComplete="off"
            />
          </label>
        </section>
        <section className="create-card" aria-labelledby="basics-destinations">
          <div className="section-top">
            <div>
              <h2 id="basics-destinations">Where are you headed?</h2>
              <p>
                Add at least one destination. Put your stops in the order you
                like.
              </p>
            </div>
          </div>
          <div className="create-destinations">
            {value.rows.map((row, index) => (
              <div
                className="create-destination"
                key={row.key}
                ref={(node) => {
                  if (node) destinationNodes.current.set(row.key, node);
                  else destinationNodes.current.delete(row.key);
                }}
              >
                <div className="create-location">
                  <LocationPicker
                    label={`Destination ${index + 1}`}
                    name={`destination_${row.key}`}
                    scope="destination"
                    invalid={
                      invalidFields.includes("destinations") && !row.location
                    }
                    errorDescriptionId={errorId}
                    required
                    initialId={row.location?.id}
                    initialLabel={row.query}
                    onQueryChange={(query) =>
                      change({
                        ...value,
                        rows: value.rows.map((item) =>
                          item.key === row.key
                            ? { ...item, query, location: null }
                            : item,
                        ),
                      })
                    }
                    onResolved={(location) => {
                      if (location)
                        change({
                          ...value,
                          rows: value.rows.map((item) =>
                            item.key === row.key
                              ? { ...item, location, query: location.label }
                              : item,
                          ),
                        });
                    }}
                  />
                </div>
                <div className="create-stop-actions">
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Move destination ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Move destination ${index + 1} down`}
                    disabled={index === value.rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Remove destination ${index + 1}`}
                    disabled={value.rows.length === 1}
                    onClick={() => {
                      const rows = value.rows.filter(
                        (item) => item.key !== row.key,
                      );
                      pendingDestination.current =
                        rows[Math.min(index, rows.length - 1)].key;
                      change({ ...value, rows });
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={value.rows.length >= 32}
            onClick={() => {
              const key = crypto.randomUUID();
              pendingDestination.current = key;
              change({
                ...value,
                rows: [...value.rows, { key, query: "", location: null }],
              });
            }}
          >
            <Plus size={16} /> Add destination
          </button>
        </section>
        <section className="create-card" aria-labelledby="basics-dates">
          <h2 id="basics-dates">When are you going?</h2>
          <p id="required-dates">
            Choose both dates to continue. Return on or after departure. You can
            edit them later.
          </p>
          <div className="create-date-fields">
            <label>
              Departure <span className="muted">(required)</span>
              <input
                type="date"
                name="start_date"
                required
                aria-invalid={invalidFields.includes("start_date") || undefined}
                aria-describedby={
                  "required-dates" +
                  (invalidFields.includes("start_date") ? " " + errorId : "")
                }
                value={value.start_date}
                onChange={(event) =>
                  change({ ...value, start_date: event.target.value })
                }
              />
            </label>
            <label>
              Return <span className="muted">(required)</span>
              <input
                type="date"
                name="end_date"
                required
                min={value.start_date || undefined}
                aria-invalid={invalidFields.includes("end_date") || undefined}
                aria-describedby={
                  "required-dates" +
                  (invalidFields.includes("end_date") ? " " + errorId : "")
                }
                value={value.end_date}
                onChange={(event) =>
                  change({ ...value, end_date: event.target.value })
                }
              />
            </label>
          </div>
        </section>
      </fieldset>
      {!ready && (
        <p className="create-notice" role="status">
          Private drafts need database migration 010 before saving is available.
          Your inputs can still be kept in this browser.
        </p>
      )}
      {storageError && (
        <p role="status">
          Browser storage is unavailable. Keep this page open until your draft
          is saved.
        </p>
      )}
      {changedElsewhere && (
        <p role="alert">
          A newer version was saved in another tab. Reload to review it before
          continuing.
        </p>
      )}
      {cached && cached.revision < revision && (
        <p role="status">
          The saved draft is newer than this browser’s recovery copy. Showing
          the saved version.
        </p>
      )}
      {error && (
        <p
          id={errorId}
          ref={errorRef}
          className="create-error"
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      )}
      <div className="create-footer">
        <p>
          <LockKeyhole size={16} aria-hidden="true" /> Private until you finish
          creating your trip.
        </p>
        <button
          className="button primary"
          type="submit"
          disabled={busy || !ready || changedElsewhere}
        >
          {busy ? "Saving your draft…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

export function DraftChoices({
  userId,
  drafts,
  newId,
}: {
  userId: string;
  drafts: PrivateDraft[];
  newId: string;
}) {
  const { headingRef } = useCreationFocus("draft-recovery");
  const text = useSyncExternalStore(
    subscribeLocalBasics,
    () => localBasicsList(userId),
    () => "[]",
  );
  const local = (JSON.parse(text) as LocalTripBasics[]).filter(
    (item) => !drafts.some((draft) => draft.id === item.id),
  );
  return (
    <section className="create-trip">
      <CreationProgress />
      <div className="create-intro">
        <h1 ref={headingRef} tabIndex={-1}>
          Pick up where you left off?
        </h1>
        <p>
          Your drafts stay private. Choose one to continue, or start something
          new.
        </p>
      </div>
      <div className="create-draft-list">
        {drafts.map((draft) => (
          <article className="create-card" key={draft.id}>
            <span className="eyebrow">
              Private draft · Step {draft.draft_step} of 3
            </span>
            <h2>{draft.name}</h2>
            <p>
              {draft.draft_data.destinations
                .map((location) => location.label)
                .join(" → ")}
            </p>
            <p className="muted">
              Last edited {new Date(draft.updated_at).toLocaleString()}
            </p>
            <a
              className="button secondary"
              href={`/trips/new?draft=${draft.id}`}
            >
              Resume {draft.name}
            </a>
          </article>
        ))}
        {local.map((item) => (
          <article className="create-card" key={item.id}>
            <span className="eyebrow">In this browser · Step 1 of 3</span>
            <h2>{item.name || "Your new adventure"}</h2>
            <p>
              {item.rows
                .map((row) => row.query)
                .filter(Boolean)
                .join(" → ") || "Destinations still to choose"}
            </p>
            <p className="muted">
              Last edited {new Date(item.updated_at).toLocaleString()}
            </p>
            <a className="button secondary" href={`/trips/new?new=${item.id}`}>
              Resume {item.name || "trip basics"}
            </a>
          </article>
        ))}
      </div>
      <a className="button primary" href={`/trips/new?new=${newId}`}>
        Start a new trip
      </a>
    </section>
  );
}
