import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShellView } from "../../components/app-shell-view";
import { BookingManager } from "../../components/booking-manager";
import { BudgetManager } from "../../components/budget-manager";
import {
  BookingCollection,
  type CollectionRequest,
} from "../../components/booking-collection";
import {
  emptyCollectionEntry,
  mergeExtraction,
  reviewedBookingFields,
  type CollectionEntry,
  type CollectionAttachment,
} from "../../lib/booking-collection";
import { extractLabeledText } from "../../lib/booking-extraction";
import {
  overviewTrip,
  overviewBooking,
  overviewSegment,
} from "./trip-overview";
import type { Trip } from "../../lib/domain";
import type { ManagedBooking, ManagedExpense } from "../../lib/booking-budget";
const trip: Trip = {
  ...overviewTrip,
  name: "A little city escape",
  budget: 500,
  owner_id: "fixture-owner",
};
const segment = overviewSegment({
  kind: "activity",
  start_date: trip.start_date,
  end_date: trip.start_date,
  title: "A saved museum visit",
});
const initial = {
  bookings: [
    {
      ...overviewBooking({
        title: "Museum reservation",
        category: "activity",
        start_date: trip.start_date,
        end_date: trip.start_date,
        reservation_status: "confirmed",
        verification: "unverified",
        segment_id: segment.id,
        price: 80,
        paid_amount: 40,
      }),
      finance_revision: 0,
    },
  ],
  expenses: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      trip_id: trip.id,
      title: "Museum tickets",
      amount: 40,
      currency: "EUR",
      category: "Activities",
      day: trip.start_date,
      payment_method: "card" as const,
      notes: "Already recorded, do not add booking price again.",
      booking_id: "33333333-3333-4333-8333-333333333333",
      finance_revision: 0,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      trip_id: trip.id,
      title: "Lunch abroad",
      amount: 25,
      currency: "USD",
      category: "Food & Drink",
      day: trip.start_date,
      payment_method: "cash" as const,
      notes: "",
      finance_revision: 0,
    },
  ],
  trip,
};
type Store = {
  bookings: ManagedBooking[];
  expenses: ManagedExpense[];
  trip: typeof trip;
};
function Fixture() {
  const mode = new URLSearchParams(location.search).get("mode") || "normal",
    key = "fixture:money:" + mode;
  const [state, setState] = useState<Store>(
      () =>
        JSON.parse(sessionStorage.getItem(key) || "null") ||
        (mode === "empty"
          ? { bookings: [], expenses: [], trip: { ...trip, budget: null } }
          : initial),
    ),
    [view, setView] = useState<"bookings" | "budget">("bookings"),
    [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<CollectionEntry[]>([]),
    [attachments, setAttachments] = useState<CollectionAttachment[]>([]);
  const commit = (next: Store) => {
    sessionStorage.setItem(key, JSON.stringify(next));
    setState(next);
  };
  const collectionRequest: CollectionRequest = async (
    body,
    extract = false,
  ) => {
    await new Promise((r) => setTimeout(r, 60));
    const v = body instanceof FormData ? Object.fromEntries(body) : body,
      id = String(v.id || v.collection_entry_id);
    const saved = JSON.parse(
      sessionStorage.getItem(key + ":collection") ||
        '{"entries":[],"attachments":[]}',
    ) as { entries: CollectionEntry[]; attachments: CollectionAttachment[] };
    let entry =
      saved.entries.find((e) => e.id === id) || emptyCollectionEntry(id);
    const persist = (e: CollectionEntry) => {
      entry = { ...e, revision: entry.revision + 1 };
      saved.entries = saved.entries.filter((e) => e.id !== id).concat(entry);
      sessionStorage.setItem(key + ":collection", JSON.stringify(saved));
      setEntries(saved.entries);
      setAttachments(saved.attachments);
    };
    if (extract) {
      if (!entry.extraction.warnings.length) {
        persist({
          ...entry,
          extraction: {
            status: "failed",
            warnings: ["Reading failed; original remains saved."],
            evidence: {},
          },
        });
        return {
          entry,
          error:
            "Reading failed. Your original file is still saved. Correct manually or retry.",
        };
      }
      persist(
        mergeExtraction(entry, {
          ...extractLabeledText(
            "Provider: Test provider\nStart date: 2027-05-01",
          ),
          method: "ai",
        }),
      );
      return { entry };
    }
    if (v.action === "upload") {
      const file = v.file as File;
      entry = {
        ...entry,
        source: {
          attachment_id: crypto.randomUUID(),
          filename: file.name,
          size: file.size,
          content_type: file.type,
          checksum: "a".repeat(64),
        },
      };
      const attachment: CollectionAttachment = {
        id: entry.source!.attachment_id,
        intake_id: id,
        filename: file.name,
        size: file.size,
        state: "ready",
      };
      saved.attachments.push(attachment);
      persist(entry);
      return { entry, attachment };
    }
    if (v.action === "save") {
      const parsed = reviewedBookingFields(
        v.fields as CollectionEntry["fields"],
        trip.id,
      );
      if (v.review_status === "reviewed" && parsed.success) {
        commit({
          ...state,
          bookings: [
            ...state.bookings,
            {
              ...parsed.data,
              payment_due_date: (v.fields as CollectionEntry["fields"])
                .payment_due_date as string | null,
              id,
              finance_revision: 0,
              reservation_status: "unknown",
            },
          ],
        });
        saved.entries = saved.entries.filter((e) => e.id !== id);
        sessionStorage.setItem(key + ":collection", JSON.stringify(saved));
        setEntries(saved.entries);
        return { materialized: true };
      }
      persist({
        ...entry,
        fields: v.fields as CollectionEntry["fields"],
        review_status: v.review_status as CollectionEntry["review_status"],
        reservation_status:
          v.reservation_status as CollectionEntry["reservation_status"],
      });
      return { entry };
    }
    if (v.action === "remove") {
      saved.entries = saved.entries.filter((e) => e.id !== id);
      saved.attachments = saved.attachments.filter((a) => a.intake_id !== id);
      sessionStorage.setItem(key + ":collection", JSON.stringify(saved));
      setEntries(saved.entries);
      return { removed: id };
    }
    return { error: "Unsupported fixture operation" };
  };
  const maybeFail = () => {
    if (mode === "failure" && !failed) {
      setFailed(true);
      return { error: "Save failed. Your input is preserved." };
    }
    return null;
  };
  const card = { ...state.trip, shared: false, lifecycle: "upcoming" as const };
  return (
    <AppShellView
      trips={[card]}
      activeTrip={card}
      pathname={"/trips/" + trip.id}
      view={view}
      day={null}
      accountMenu={<span>Isolated money fixture</span>}
      LinkComponent={({
        href,
        children,
        ...props
      }: {
        href: string;
        children: React.ReactNode;
      }) => (
        <a
          {...props}
          href={href}
          onClick={(e) => {
            const value = new URL(href, location.origin).searchParams.get(
              "view",
            );
            if (value === "budget" || value === "bookings") {
              e.preventDefault();
              setView(value);
            }
          }}
        >
          {children}
        </a>
      )}
    >
      {view === "bookings" ? (
        <BookingManager
          trip={state.trip}
          segments={[segment]}
          bookings={state.bookings}
          attachments={[
            {
              id: "88888888-8888-4888-8888-888888888888",
              booking_id: initial.bookings[0].id,
              filename: "confirmation.pdf",
              size: 100,
              state: "ready",
            },
          ]}
          canEdit={mode !== "viewer"}
          owner={mode !== "viewer"}
          ready={mode !== "pending"}
          paymentDueReady={true}
          collectionReady={mode !== "pending"}
          collection={
            <BookingCollection
              key="collection"
              trip={state.trip}
              segments={[segment]}
              initialEntries={entries}
              initialAttachments={attachments}
              stepMode={false}
              paymentDueReady={true}
              ready={mode !== "pending"}
              live
              request={collectionRequest}
            />
          }
          LinkComponent={({
            href,
            children,
            ...props
          }: {
            href: string;
            children: React.ReactNode;
          }) => (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                if (href.includes("view=budget")) {
                  e.preventDefault();
                  setView("budget");
                }
              }}
            >
              {children}
            </a>
          )}
          save={async (form) => {
            const failure = maybeFail();
            if (failure) return failure;
            await new Promise((r) => setTimeout(r, 60));
            const data = Object.fromEntries(form),
              id = String(data.id),
              old = state.bookings.find((b) => b.id === id);
            const b = {
              ...overviewBooking(),
              ...data,
              id,
              trip_id: trip.id,
              price: data.price === "" ? null : Number(data.price),
              paid_amount:
                data.paid_amount === "" ? null : Number(data.paid_amount),
              segment_id: String(data.segment_id) || null,
              finance_revision: old ? (old.finance_revision || 0) + 1 : 0,
            } as ManagedBooking;
            commit({
              ...state,
              bookings: state.bookings.filter((b) => b.id !== id).concat(b),
            });
            return { message: "Booking saved." };
          }}
          remove={async (b) => {
            commit({
              ...state,
              bookings: state.bookings.filter((row) => row.id !== b.id),
              expenses: state.expenses.map((e) =>
                e.booking_id === b.id ? { ...e, booking_id: null } : e,
              ),
            });
            return { message: "Booking removed. Expenses preserved." };
          }}
        />
      ) : (
        <BudgetManager
          trip={state.trip}
          bookings={state.bookings}
          expenses={state.expenses}
          allocations={[]}
          canEdit={mode !== "viewer"}
          ready={mode !== "pending"}
          today={trip.start_date}
          saveExpense={async (input) => {
            const failure = maybeFail();
            if (failure) return failure;
            const old = state.expenses.find((e) => e.id === input.id);
            commit({
              ...state,
              expenses: state.expenses
                .filter((e) => e.id !== input.id)
                .concat({
                  ...input,
                  amount: Number(input.amount),
                  trip_id: trip.id,
                  finance_revision: old ? (old.finance_revision || 0) + 1 : 0,
                }),
            });
            return { message: "Expense saved." };
          }}
          removeExpense={async (e) => {
            commit({
              ...state,
              expenses: state.expenses.filter((row) => row.id !== e.id),
            });
            return { message: "Expense removed." };
          }}
          saveBudget={async (input) => {
            const failure = maybeFail();
            if (failure) return failure;
            commit({
              ...state,
              trip: {
                ...state.trip,
                budget: input.amount === "" ? null : Number(input.amount),
                currency: input.currency,
              },
            });
            return { message: "Budget saved." };
          }}
          LinkComponent={({
            href,
            children,
            ...props
          }: {
            href: string;
            children: React.ReactNode;
          }) => (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                if (href.includes("view=bookings")) {
                  e.preventDefault();
                  setView("bookings");
                }
              }}
            >
              {children}
            </a>
          )}
        />
      )}
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
