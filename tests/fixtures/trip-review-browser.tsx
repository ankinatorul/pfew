import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { TripReview } from "../../components/trip-review";
import { TripBasicsForm, DraftChoices } from "../../components/trip-basics";
import {
  BookingCollection,
  type CollectionRequest,
} from "../../components/booking-collection";
import { extractLabeledText } from "../../lib/booking-extraction";
import { AppShellView } from "../../components/app-shell-view";
import { TripOverviewView } from "../../components/trip-overview-view";
import type { TripOverview } from "../../lib/trip-overview";
declare const REVIEW_OVERVIEW_MODEL: TripOverview;
import { overviewTrip } from "./trip-overview";
import { travelStyleLabel, storedTravelStyle } from "../../lib/trip-style";
import { automaticTripTheme } from "../../lib/trip-theme";
import {
  emptyCollectionEntry,
  reviewedBookingFields,
  mergeExtraction,
  type CollectionAttachment,
  type CollectionEntry,
} from "../../lib/booking-collection";
import {
  rememberActiveTrip,
  readActiveTrip,
} from "../../lib/active-trip-store";
import { resolveActiveTrip } from "../../lib/app-navigation";
import type { TripCard } from "../../lib/trip-collection";
import type { ReviewInput, ReviewResult } from "../../lib/trip-review";
import type { PrivateDraft, TripBasics } from "../../lib/trip-drafts";
const user = "review-fixture-owner";
function Fixture() {
  const params = new URLSearchParams(location.search),
    id = params.get("draft") || params.get("new") || overviewTrip.id,
    key = "fixture:review:" + id;
  type Store = {
    draft: PrivateDraft;
    style: string;
    entries: CollectionEntry[];
    finalized: boolean;
    step: number;
    theme: string;
    creates: number;
    failed: boolean;
    newTrip?: boolean;
    attachments?: CollectionAttachment[];
    failedReads?: string[];
    failedBookingSaves?: string[];
  };
  const initial: Store = {
    draft: {
      id,
      name: "Paris weekend",
      start_date: "2027-06-01",
      end_date: "2027-06-06",
      draft_data: {
        destinations: [
          {
            id: "geo:FR:WyJQYXJpcyIsIkZyYW5jZSIsNDguODUsMi4zNV0",
            label: "Paris, France",
            city: "Paris",
            country: "France",
            latitude: 48.85,
            longitude: 2.35,
            timezone: "Europe/Paris",
            source: "coordinates",
          } as const,
        ],
      },
      draft_step: 3,
      draft_revision: 1,
      updated_at: new Date().toISOString(),
    },
    style: "Comfort",
    entries: [],
    finalized: false,
    step: Number(params.get("step") || 3),
    theme: "Default",
    creates: 0,
    failed: false,
    newTrip: params.get("fresh") === "1" || Boolean(params.get("new")),
    attachments: [],
    failedReads: [],
  };
  if (initial.newTrip) {
    initial.step = 1;
    initial.draft = {
      ...initial.draft,
      name: "",
      start_date: "",
      end_date: "",
      draft_revision: 0,
      draft_data: { destinations: [] },
    };
  }
  const load = (): Store =>
    JSON.parse(localStorage.getItem(key) || JSON.stringify(initial));
  const [state, setState] = useState(load),
    [open, setOpen] = useState(false);
  const store = (s: Store) => {
    localStorage.setItem(key, JSON.stringify(s));
    setState(s);
  };
  const trip = {
    ...overviewTrip,
    ...state.draft,
    owner_id: user,
    style: state.style,
    creation_state: state.finalized
      ? ("finalized" as const)
      : ("draft" as const),
    theme: state.theme,
    start_date: state.draft.start_date!,
    end_date: state.draft.end_date!,
  };
  const basics = {
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    destinations: state.draft.draft_data.destinations,
  };
  const request = async (
    input: ReviewInput,
    finalize = false,
  ): Promise<ReviewResult> => {
    if (finalize)
      sessionStorage.setItem(
        "fixture:finalize-calls",
        String(
          Number(sessionStorage.getItem("fixture:finalize-calls") || 0) + 1,
        ),
      );
    await new Promise((r) => setTimeout(r, 180));
    const next = load();
    if (finalize && params.get("fail") === "1" && !next.failed) {
      next.failed = true;
      store(next);
      return {
        error:
          "Your trip could not be created. Your saved draft and booking files remain recoverable. Retry safely.",
      };
    }
    if (params.get("stale") === "1")
      return {
        error:
          "Your trip or bookings changed in another tab. Reload this review before creating your trip.",
      };
    if (!next.finalized) {
      next.style = storedTravelStyle(input.style);
      next.draft.draft_revision++;
      next.draft.draft_step = 3;
      next.step = 3;
      if (finalize) {
        next.finalized = true;
        next.theme = automaticTripTheme(
          next.draft.name,
          next.draft.draft_data.destinations,
        ).theme;
        next.creates++;
      }
      store(next);
    }
    return {
      id,
      revision: next.draft.draft_revision,
      style: travelStyleLabel(next.style),
      theme: next.theme,
      finalized: next.finalized,
    };
  };
  const collection: CollectionRequest = async (input, extract = false) => {
    await new Promise((r) => setTimeout(r, 100));
    const values =
        input instanceof FormData ? Object.fromEntries(input) : input,
      next = load();
    const entryId = String(values.id || values.collection_entry_id);
    const oldEntry =
      next.entries.find((e) => e.id === entryId) ||
      emptyCollectionEntry(entryId);
    const saveEntry = (entry: CollectionEntry) => {
      const saved = { ...entry, revision: oldEntry.revision + 1 };
      next.entries = next.entries.some((e) => e.id === entryId)
        ? next.entries.map((e) => (e.id === entryId ? saved : e))
        : [...next.entries, saved];
      store(next);
      return saved;
    };
    if (extract) {
      if (
        params.get("failExtraction") === "1" &&
        !(next.failedReads || []).includes(entryId)
      ) {
        next.failedReads = [...(next.failedReads || []), entryId];
        const entry = saveEntry({
          ...oldEntry,
          review_status: "needs_review",
          extraction: {
            status: "failed",
            warnings: ["Reading failed; the original is still saved."],
            evidence: {},
          },
        });
        return {
          entry,
          error:
            "Reading failed. Your original file is still saved. Correct the fields manually or retry.",
        };
      }
      return {
        entry: saveEntry(
          mergeExtraction(oldEntry, {
            ...extractLabeledText(
              String(
                values.text ||
                  "Provider: Fixture airline\nStart date: 2027-06-01",
              ),
            ),
            method: values.mode === "ai" ? "ai" : "text",
          }),
        ),
      };
    }
    if (values.action === "upload") {
      const file = values.file as File,
        source = oldEntry.source || {
          attachment_id: crypto.randomUUID(),
          filename: file.name,
          size: file.size,
          content_type: file.type,
          checksum: "a".repeat(64),
        };
      const attachment: CollectionAttachment = {
        id: source.attachment_id,
        intake_id: entryId,
        filename: source.filename,
        size: source.size,
        state: "ready",
      };
      next.attachments = [
        ...(next.attachments || []).filter((a) => a.id !== attachment.id),
        attachment,
      ];
      return { entry: saveEntry({ ...oldEntry, source }), attachment };
    }
    if (values.action === "remove") {
      next.entries = next.entries.filter((e) => e.id !== entryId);
      next.attachments = (next.attachments || []).filter(
        (a) => a.intake_id !== entryId,
      );
      store(next);
      return { removed: entryId };
    }
    if (values.action === "advance") {
      next.step = 3;
      store(next);
      return { advanced: true };
    }
    if (values.action === "save") {
      if (
        params.get("failBookingSave") === "1" &&
        !(next.failedBookingSaves || []).includes(entryId)
      ) {
        next.failedBookingSaves = [...(next.failedBookingSaves || []), entryId];
        store(next);
        return { error: "Couldn’t save this booking. Try again." };
      }
      if (
        values.review_status === "reviewed" &&
        !reviewedBookingFields(values.fields as CollectionEntry["fields"], id)
          .success
      )
        return { error: "Check required booking fields or save unfinished." };
      const old =
        next.entries.find((e) => e.id === values.id) ||
        emptyCollectionEntry(String(values.id));
      const entry = {
        ...old,
        revision: old.revision + 1,
        fields: values.fields as CollectionEntry["fields"],
        review_status: values.review_status as CollectionEntry["review_status"],
        reservation_status:
          values.reservation_status as CollectionEntry["reservation_status"],
      };
      next.entries = [...next.entries.filter((e) => e.id !== entry.id), entry];
      store(next);
      return { entry };
    }
    return { error: "Unsupported isolated fixture operation" };
  };
  const closer = {
    ...overviewTrip,
    id: "99999999-9999-4999-8999-999999999999",
    name: "An earlier upcoming trip",
    start_date: "2027-05-01",
    end_date: "2027-05-02",
    shared: false,
    lifecycle: "upcoming" as const,
    creation_state: "finalized" as const,
  };
  const cards: TripCard[] = state.finalized
    ? [closer, { ...trip, shared: false, lifecycle: "upcoming" }]
    : [closer];
  const active = resolveActiveTrip(
    cards,
    open ? "/trips/" + id : "/trips/new",
    null,
    readActiveTrip(user),
    closer.id,
  );
  return (
    <AppShellView
      trips={cards}
      activeTrip={active}
      pathname={open ? "/trips/" + id : "/trips/new"}
      view="hub"
      day={null}
      accountMenu={<span>Isolated review fixture</span>}
    >
      <section className="create-trip">
        {params.get("choices") === "1" ? (
          <DraftChoices
            userId={user}
            newId="88888888-8888-4888-8888-888888888888"
            drafts={Object.keys(localStorage)
              .filter((k) => k.startsWith("fixture:review:"))
              .map((k) => JSON.parse(localStorage.getItem(k)!) as Store)
              .filter((s) => !s.finalized)
              .map((s) => s.draft)}
          />
        ) : open ? (
          <>
            <TripOverviewView
              model={{
                ...REVIEW_OVERVIEW_MODEL,
                tripId: id,
                name: trip.name,
                bookings: {
                  total: state.entries.filter(
                    (e) => e.review_status === "reviewed",
                  ).length,
                  confirmed: state.entries.filter(
                    (e) =>
                      e.review_status === "reviewed" &&
                      e.reservation_status === "confirmed",
                  ).length,
                },
              }}
              role="owner"
            />
            <p>Finalized fixture count: {state.creates}</p>
          </>
        ) : state.step === 1 ? (
          <TripBasicsForm
            key={"basics" + state.draft.draft_revision}
            userId={user}
            id={id}
            draft={state.newTrip ? undefined : state.draft}
            ready
            save={async (_id, _revision, value) => {
              sessionStorage.setItem(
                "fixture:basics-save-calls",
                String(
                  Number(
                    sessionStorage.getItem("fixture:basics-save-calls") || 0,
                  ) + 1,
                ),
              );
              const b = value as TripBasics,
                next = load();
              next.draft = {
                ...next.draft,
                ...b,
                draft_data: {
                  ...next.draft.draft_data,
                  destinations: b.destinations,
                },
                draft_revision: next.draft.draft_revision + 1,
              };
              next.newTrip = false;
              store(next);
              return { draft: next.draft };
            }}
            onSaved={() => {
              const next = load();
              next.step = 2;
              store(next);
            }}
          />
        ) : state.step === 2 ? (
          <BookingCollection
            paymentDueReady
            trip={trip}
            initialEntries={state.entries}
            initialAttachments={state.attachments || []}
            live
            request={collection}
            onNavigate={(step) => {
              const next = load();
              next.step = step;
              store(next);
            }}
          />
        ) : (
          <TripReview
            trip={trip}
            basics={basics}
            revision={state.draft.draft_revision}
            entries={state.entries}
            ready
            finalized={state.finalized}
            save={(input) => request(input)}
            finalize={(input) => request(input, true)}
            onNavigate={(step) => {
              const next = load();
              next.step = step;
              store(next);
            }}
            onOpen={(tripId) => {
              rememberActiveTrip(user, tripId);
              setOpen(true);
            }}
          />
        )}
      </section>
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
