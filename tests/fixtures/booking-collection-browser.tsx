import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookingCollection,
  type CollectionRequest,
  type CollectionReply,
} from "../../components/booking-collection";
import { AppShellView } from "../../components/app-shell-view";
import {
  emptyCollectionEntry,
  mergeExtraction,
  reviewedBookingFields,
  collectionCounts,
  type CollectionEntry,
  type CollectionAttachment,
} from "../../lib/booking-collection";
import { extractLabeledText } from "../../lib/booking-extraction";
import { overviewTrip } from "./trip-overview";

function Fixture() {
  const query = new URLSearchParams(location.search),
    trip = {
      ...overviewTrip,
      id: query.get("trip") || overviewTrip.id,
      creation_state: "draft" as const,
    };
  const key = "fixture:collection:" + trip.id;
  type Store = {
    entries: CollectionEntry[];
    attachments: CollectionAttachment[];
    step: number;
    uploadFailures: string[];
    readFailures: string[];
  };
  const load = (): Store =>
    JSON.parse(
      localStorage.getItem(key) ||
        '{"entries":[],"attachments":[],"step":2,"uploadFailures":[],"readFailures":[]}',
    );
  const [initial] = useState(load),
    [step, setStep] = useState(initial.step),
    [cycle, setCycle] = useState(0);
  const store = (value: Store) =>
    localStorage.setItem(key, JSON.stringify(value));
  const request: CollectionRequest = async (body, extract = false) => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const value = body instanceof FormData ? Object.fromEntries(body) : body;
    const state = load();
    const id = String(value.id || value.collection_entry_id),
      old = state.entries.find((e) => e.id === id);
    let entry = old || emptyCollectionEntry(id);
    if (Number(value.revision) !== entry.revision)
      return { error: "This entry changed in another tab." };
    const save = (next: CollectionEntry) => {
      entry = { ...next, revision: entry.revision + 1 };
      state.entries = [...state.entries.filter((e) => e.id !== id), entry];
      store(state);
      return entry;
    };
    if (extract) {
      if (value.mode === "ai" && !state.readFailures.includes(id)) {
        state.readFailures.push(id);
        save({
          ...entry,
          extraction: {
            ...entry.extraction,
            status: "failed",
            warnings: ["Reading failed; the original is still saved."],
          },
        });
        return {
          entry,
          error:
            "Reading failed. Your original file is still saved. Correct the fields manually or retry reading it.",
        };
      }
      save(
        mergeExtraction(entry, {
          ...extractLabeledText(
            String(
              value.text || "Provider: Fixture airline\nStart date: 2027-05-01",
            ),
          ),
          method: value.mode === "ai" ? "ai" : "text",
        }),
      );
      return { entry };
    }
    if (value.action === "advance") {
      state.step = 3;
      store(state);
      return { advanced: true };
    }
    if (value.action === "remove") {
      state.entries = state.entries.filter((e) => e.id !== id);
      state.attachments = state.attachments.filter((a) => a.intake_id !== id);
      store(state);
      return { removed: id };
    }
    if (value.action === "upload" || value.action === "recover_upload") {
      const file = value.file as File | undefined;
      if (!entry.source)
        save({
          ...entry,
          source: {
            attachment_id: crypto.randomUUID(),
            filename: file?.name || "source.pdf",
            size: file?.size || 100,
            content_type: file?.type || "application/pdf",
            checksum: "a".repeat(64),
          },
        });
      const attachment: CollectionAttachment = {
        id: entry.source!.attachment_id,
        intake_id: id,
        filename: entry.source!.filename,
        size: entry.source!.size,
        state: "ready",
      };
      if (
        query.get("failUpload") === "1" &&
        !state.uploadFailures.includes(id)
      ) {
        state.uploadFailures.push(id);
        attachment.state = "pending";
        state.attachments.push(attachment);
        store(state);
        return { entry, error: "Upload is not confirmed. Retry safely." };
      }
      state.attachments = [
        ...state.attachments.filter((a) => a.id !== attachment.id),
        attachment,
      ];
      store(state);
      return { entry, attachment };
    }
    if (value.action === "save") {
      if (
        value.review_status === "reviewed" &&
        !reviewedBookingFields(
          value.fields as CollectionEntry["fields"],
          trip.id,
        ).success
      )
        return {
          error: "Check required booking fields or save as Needs review.",
        };
      save({
        ...entry,
        fields: value.fields as CollectionEntry["fields"],
        review_status: value.review_status as CollectionEntry["review_status"],
        reservation_status:
          value.reservation_status as CollectionEntry["reservation_status"],
      });
      return { entry };
    }
    return { error: "Unsupported fixture operation" } satisfies CollectionReply;
  };
  const counts = collectionCounts(load().entries);
  return (
    <AppShellView
      trips={[]}
      activeTrip={null}
      pathname="/trips/new"
      view="hub"
      day={null}
      accountMenu={<span>Isolated collection fixture</span>}
    >
      <section className="create-trip">
        {step === 2 ? (
          <BookingCollection
            key={cycle}
            trip={trip}
            initialEntries={load().entries}
            initialAttachments={load().attachments}
            request={request}
            live
            onNavigate={(next) => {
              const state = load();
              state.step = next;
              store(state);
              setStep(next);
            }}
          />
        ) : step === 1 ? (
          <>
            <h1>Trip Basics preserved</h1>
            <p>
              {trip.name} · {trip.start_date} · {trip.end_date}
            </p>
            <button
              onClick={() => {
                setStep(2);
                setCycle(cycle + 1);
              }}
            >
              Return to Add Bookings
            </button>
          </>
        ) : (
          <>
            <h1>Travel Style &amp; Review is next</h1>
            <p>
              {counts.reviewed} reviewed · {counts.unfinished} need review
            </p>
            <p>Private draft · not finalized</p>
            <button
              onClick={() => {
                const state = load();
                state.step = 2;
                store(state);
                setStep(2);
                setCycle(cycle + 1);
              }}
            >
              Back to Add Bookings
            </button>
          </>
        )}
      </section>
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
