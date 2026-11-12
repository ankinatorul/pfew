import type { Trip, Segment } from "../lib/domain";
import { access } from "../lib/access";
import { loadBookingCollection } from "../lib/booking-collection-server";
import { BookingCollectionClient } from "./booking-collection-client";
import { BookingsClient, BudgetClient } from "./booking-budget-client";
import { BudgetPlanningTools } from "./budget-planning-tools";
import { UploadForm, RemoveAttachment } from "./essentials/attachment-form";
import type {
  ManagedBooking,
  ManagedExpense,
  PrivateConfirmation,
} from "../lib/booking-budget";
import type { Allocation } from "../lib/essentials";
export async function BookingBudget({
  trip,
  segments,
  view,
  canEdit,
  edit,
}: {
  trip: Trip;
  segments: Segment[];
  view: "bookings" | "budget";
  canEdit: boolean;
  edit?: string;
}) {
  const { db, user } = await access(),
    owner = trip.owner_id === user.id;
  const [bookings, capability] = await Promise.all([
    db.from("bookings").select("*").eq("trip_id", trip.id),
    db
      .from("bookings")
      .select("finance_revision,reservation_status")
      .eq("trip_id", trip.id)
      .limit(0),
  ]);
  const rows = (bookings.data || []) as ManagedBooking[];
  if (view === "bookings") {
    const [files, collection] = await Promise.all([
      db
        .from("booking_attachments")
        .select("id,booking_id,intake_id,filename,size,state")
        .eq("trip_id", trip.id),
      owner ? loadBookingCollection(db, trip.id) : Promise.resolve(null),
    ]);
    const attachments = (files.data || []) as PrivateConfirmation[];
    const fileTools = Object.fromEntries(
      rows.map((b) => [
        b.id,
        <div key={b.id}>
          {attachments
            .filter((f) => f.booking_id === b.id)
            .map((f) => (
              <RemoveAttachment key={f.id} trip={trip.id} id={f.id} />
            ))}
          {canEdit && <UploadForm trip={trip.id} booking={b.id} />}
        </div>,
      ]),
    );
    return (
      <BookingsClient
        trip={trip}
        segments={segments}
        bookings={rows}
        attachments={attachments}
        canEdit={canEdit}
        ready={!capability.error}
        collectionReady={!!collection?.ready}
        owner={owner}
        initialEdit={rows.some((b) => b.id === edit) ? edit : undefined}
        loadError={
          bookings.error || files.error
            ? "Some bookings or private files could not be loaded. Reload before making changes."
            : undefined
        }
        fileTools={fileTools}
        collection={
          collection && (
            <BookingCollectionClient
              trip={trip}
              segments={segments}
              initialEntries={collection.entries}
              initialAttachments={collection.attachments}
              ready={collection.ready}
              setupError={collection.error}
              stepMode={false}
              live={
                process.env.AI_MODE === "live" &&
                Boolean(process.env.AI_API_KEY)
              }
            />
          )
        }
      />
    );
  }
  const [expenses, allocations, settings, expenseCapability] =
    await Promise.all([
      db.from("expenses").select("*").eq("trip_id", trip.id),
      db.from("budget_allocations").select("*").eq("trip_id", trip.id),
      db
        .from("budget_settings")
        .select("*")
        .eq("trip_id", trip.id)
        .maybeSingle(),
      db
        .from("expenses")
        .select("title,booking_id,finance_revision")
        .eq("trip_id", trip.id)
        .limit(0),
    ]);
  const allocationRows = (allocations.data || []) as Allocation[],
    loadError = !!(
      bookings.error ||
      expenses.error ||
      allocations.error ||
      settings.error
    );
  return (
    <BudgetClient
      trip={trip}
      bookings={rows}
      expenses={(expenses.data || []) as ManagedExpense[]}
      allocations={allocationRows}
      canEdit={canEdit}
      ready={!capability.error && !expenseCapability.error}
      loadError={
        loadError
          ? "Some saved budget data could not be loaded. Totals may be incomplete; reload before editing."
          : undefined
      }
      today={new Intl.DateTimeFormat("en-CA", {
        timeZone: trip.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())}
      initialExpense={edit}
      planning={
        !loadError && (
          <BudgetPlanningTools
            trip={trip}
            segments={segments}
            bookings={rows}
            allocations={allocationRows}
            include={settings.data?.include_prepaid ?? true}
            canEdit={canEdit}
            edit={edit}
          />
        )
      }
    />
  );
}
