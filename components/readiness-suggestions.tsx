"use client";
import { useState, useActionState } from "react";
import {
  packingStarter,
  prepStarter,
  withoutExisting,
  packingCandidateSchema,
  type ReadinessContext,
  type PackingCandidate,
  type PrepCandidate,
  type AdditionState,
} from "../lib/readiness";
import { addReviewedPacking, addReviewedPrep } from "../app/readiness-actions";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
import { prepCategories } from "../lib/essentials";
function PackingReview({
  items,
  tripId,
  listId,
  source,
  onDiscard,
}: {
  items: PackingCandidate[];
  tripId: string;
  listId: string;
  source: "checklist" | "ai";
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState(
      items.map((item) => ({ ...item, selected: true })),
    ),
    [state, save, pending] = useActionState(
      addReviewedPacking,
      {} as AdditionState,
    ),
    online = useOnline();
  const selected = draft.filter((item) => item.selected);
  const finished = state.added !== undefined;
  return (
    <section className="card">
      <h3>Review packing additions</h3>
      <p className="muted">
        {source === "ai"
          ? "AI suggestions · unverified."
          : "Checklist suggestions · based on the context you supplied."}{" "}
        Choose what fits this list and adjust quantities. Weather, personal
        needs and airline rules have not been verified.
      </p>
      {!items.length ? (
        <p>
          No new items to suggest. Matching names already exist on this list.
        </p>
      ) : (
        <form action={save} className="form">
          <input type="hidden" name="trip_id" value={tripId} />
          <input type="hidden" name="list_id" value={listId} />
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(
              selected.map((item) => ({
                title: item.title,
                category: item.category,
                quantity: item.quantity,
                reason: item.reason,
              })),
            )}
          />
          <fieldset disabled={pending || finished || !online}>
            {draft.map((item, index) => (
              <fieldset className="suggestion-row" key={index}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) =>
                      setDraft(
                        draft.map((value, i) =>
                          i === index
                            ? { ...value, selected: event.target.checked }
                            : value,
                        ),
                      )
                    }
                  />
                  Include {item.title}
                </label>
                <div className="two">
                  <label>
                    Item name
                    <input
                      value={item.title}
                      maxLength={200}
                      required={item.selected}
                      disabled={!item.selected}
                      onChange={(event) =>
                        setDraft(
                          draft.map((value, i) =>
                            i === index
                              ? { ...value, title: event.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={item.quantity}
                      required={item.selected}
                      disabled={!item.selected}
                      onChange={(event) =>
                        setDraft(
                          draft.map((value, i) =>
                            i === index
                              ? {
                                  ...value,
                                  quantity: Number(event.target.value),
                                }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Category
                  <input
                    value={item.category}
                    maxLength={100}
                    required={item.selected}
                    disabled={!item.selected}
                    onChange={(event) =>
                      setDraft(
                        draft.map((value, i) =>
                          i === index
                            ? { ...value, category: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
                <p className="muted">{item.reason}</p>
              </fieldset>
            ))}
            <label>
              <input type="checkbox" name="approved" value="yes" required />I
              reviewed these {selected.length} selected items and quantities and
              want to add them to this shared list.
            </label>
            <Button disabled={!selected.length || pending}>
              {pending ? "Adding items…" : "Add reviewed packing items"}
            </Button>
          </fieldset>
          {!online && (
            <p role="status">
              Reconnect to add packing items. Offline copies are read-only.
            </p>
          )}
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
          {finished && (
            <p role="status">
              {state.added} items added. {state.skipped || 0} matching names
              skipped. Existing packed states were kept.
            </p>
          )}
        </form>
      )}
      <Button variant="secondary" disabled={pending} onClick={onDiscard}>
        {finished ? "Close suggestions" : "Discard suggestions"}
      </Button>
    </section>
  );
}
export function PackingSuggestions({
  tripId,
  listId,
  existing,
  context,
  live,
}: {
  tripId: string;
  listId: string;
  existing: { title: string }[];
  context: ReadinessContext;
  live: boolean;
}) {
  const [preview, setPreview] = useState<{
      items: PackingCandidate[];
      source: "checklist" | "ai";
      key: string;
    } | null>(null),
    [mode, setMode] = useState("checklist"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    online = useOnline();
  async function generate(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const clothingDays = Number(form.get("clothing_days"));
      if (mode === "checklist") {
        setPreview({
          items: withoutExisting(
            packingStarter(context, clothingDays),
            existing,
          ),
          source: "checklist",
          key: crypto.randomUUID(),
        });
        return;
      }
      if (!online) throw new Error("Reconnect to request AI suggestions.");
      const response = await fetch("/api/packing-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          list_id: listId,
          clothing_days: clothingDays,
          consent: form.get("consent") === "yes",
        }),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Suggestions unavailable.");
      setPreview({
        items: packingCandidateSchema.array().max(20).parse(result.items),
        source: "ai",
        key: crypto.randomUUID(),
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Suggestions unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (preview)
    return (
      <PackingReview
        key={preview.key}
        items={preview.items}
        tripId={tripId}
        listId={listId}
        source={preview.source}
        onDiscard={() => setPreview(null)}
      />
    );
  return (
    <details data-edit-action>
      <summary>Build a reviewed packing checklist</summary>
      <section className="card">
        <h3>A starting point, shaped by you.</h3>
        <p>
          {context.days
            ? context.days + " trip days."
            : "Trip dates unavailable."}{" "}
          Quantities apply to this list only; choose clothing days for your own
          laundry and luggage plans. Current items will be kept.
        </p>
        <form action={generate} className="form">
          <fieldset disabled={busy || !online}>
            <label>
              Days of clothing to pack
              <input
                name="clothing_days"
                type="number"
                min="1"
                max="30"
                defaultValue={Math.max(1, Math.min(context.days || 1, 7))}
                required
              />
            </label>
            <label>
              Suggestions from
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="checklist">
                  Checklist starter · no paid call
                </option>
                {live && (
                  <option value="ai">
                    AI suggestions · unverified · request budget applies
                  </option>
                )}
              </select>
            </label>
            {mode === "ai" && (
              <label>
                <input type="checkbox" name="consent" value="yes" required />
                Send trip duration, destination labels, transport types and
                these clothing preferences to the AI provider. Personal names,
                booking references and existing item names are not sent.
              </label>
            )}
            <Button disabled={busy}>
              {busy ? "Preparing suggestions…" : "Preview packing suggestions"}
            </Button>
          </fieldset>
          {!online && <p role="status">Reconnect to prepare new additions.</p>}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </section>
    </details>
  );
}
function PrepReview({
  items,
  tripId,
  onDiscard,
}: {
  items: PrepCandidate[];
  tripId: string;
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState(
      items.map((item) => ({ ...item, selected: true })),
    ),
    [state, save, pending] = useActionState(
      addReviewedPrep,
      {} as AdditionState,
    ),
    online = useOnline();
  const selected = draft.filter((item) => item.selected),
    finished = state.added !== undefined;
  return (
    <section className="card">
      <h3>Choose your next small steps.</h3>
      <p className="muted">
        These are optional checklist suggestions, not verified requirements.
        Dates stay blank until you choose them.
      </p>
      {!items.length ? (
        <p>Matching tasks already exist, including completed ones.</p>
      ) : (
        <form action={save} className="form">
          <input type="hidden" name="trip_id" value={tripId} />
          <input
            type="hidden"
            name="items"
            value={JSON.stringify(
              selected.map((item) => ({
                title: item.title,
                category: item.category,
                due_date: item.due_date,
                priority: item.priority,
                reason: item.reason,
              })),
            )}
          />
          <fieldset disabled={pending || finished || !online}>
            {draft.map((item, index) => (
              <fieldset className="suggestion-row" key={index}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) =>
                      setDraft(
                        draft.map((value, i) =>
                          i === index
                            ? { ...value, selected: event.target.checked }
                            : value,
                        ),
                      )
                    }
                  />
                  Include {item.title}
                </label>
                <label>
                  Task name
                  <input
                    value={item.title}
                    maxLength={200}
                    required={item.selected}
                    disabled={!item.selected}
                    onChange={(event) =>
                      setDraft(
                        draft.map((value, i) =>
                          i === index
                            ? { ...value, title: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
                <div className="two">
                  <label>
                    Category
                    <select
                      value={item.category}
                      onChange={(event) =>
                        setDraft(
                          draft.map((value, i) =>
                            i === index
                              ? {
                                  ...value,
                                  category: event.target
                                    .value as PrepCandidate["category"],
                                }
                              : value,
                          ),
                        )
                      }
                    >
                      {prepCategories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Due date · optional
                    <input
                      type="date"
                      value={item.due_date}
                      onChange={(event) =>
                        setDraft(
                          draft.map((value, i) =>
                            i === index
                              ? { ...value, due_date: event.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <p className="muted">{item.reason}</p>
              </fieldset>
            ))}
            <label>
              <input type="checkbox" name="approved" value="yes" required />I
              reviewed these {selected.length} selected tasks and want to add
              them to the shared trip.
            </label>
            <Button disabled={!selected.length || pending}>
              {pending ? "Adding tasks…" : "Add reviewed Prep tasks"}
            </Button>
          </fieldset>
          {!online && <p role="status">Reconnect to add tasks.</p>}
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
          {finished && (
            <p role="status">
              {state.added} tasks added. {state.skipped || 0} matching names
              skipped. Existing completed tasks were kept.
            </p>
          )}
        </form>
      )}
      <Button variant="secondary" disabled={pending} onClick={onDiscard}>
        {finished ? "Close suggestions" : "Discard suggestions"}
      </Button>
    </section>
  );
}
export function PrepSuggestions({
  tripId,
  existing,
  context,
}: {
  tripId: string;
  existing: { title: string }[];
  context: ReadinessContext;
}) {
  const [preview, setPreview] = useState<PrepCandidate[] | null>(null),
    online = useOnline();
  return (
    <details data-edit-action>
      <summary>Review suggested preparation tasks</summary>
      {preview ? (
        <PrepReview
          items={preview}
          tripId={tripId}
          onDiscard={() => setPreview(null)}
        />
      ) : (
        <section className="card">
          <p>
            A short checklist based on saved trip context. Nothing is added
            until you select and approve tasks. No paid request is made.
          </p>
          <Button
            disabled={!online}
            onClick={() =>
              setPreview(withoutExisting(prepStarter(context), existing))
            }
          >
            Preview Prep suggestions
          </Button>
          {!online && <p role="status">Reconnect to prepare new additions.</p>}
        </section>
      )}
    </details>
  );
}
