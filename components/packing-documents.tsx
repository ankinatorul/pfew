import { finalizedTrips } from "../lib/finalized-trips";
import type { Trip, Segment } from "../lib/domain";
import { access } from "../lib/access";
import {
  PackingClient,
  DocumentsClient,
  ReminderClient,
} from "./packing-documents-client";
import { PackingSuggestions } from "./readiness-suggestions";
import { savePackingTemplate } from "../app/essentials-actions";
import { Submit } from "./forms";
import { savedTripDestinations } from "../lib/trip-destinations";
import { dateRange } from "../lib/itinerary";
import type {
  ManagedPackingItem,
  ManagedPackingList,
  ReadinessTask,
  TripFile,
} from "../lib/packing-documents";
export async function PackingDocuments({
  trip,
  segments,
  view,
  canEdit,
}: {
  trip: Trip;
  segments: Segment[];
  view: "packing" | "documents";
  canEdit: boolean;
}) {
  const { db, user } = await access();
  const [tasks, reminderCapability] = await Promise.all([
    db.from("prep_tasks").select("*").eq("trip_id", trip.id),
    db
      .from("prep_tasks")
      .select("readiness_revision")
      .eq("trip_id", trip.id)
      .limit(0),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: trip.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const reminders = (
    <ReminderClient
      tripId={trip.id}
      tasks={(tasks.data || []) as ReadinessTask[]}
      topic={view === "packing" ? "packing" : "documents"}
      today={today}
      allowed={canEdit && !reminderCapability.error && !tasks.error}
    />
  );
  if (view === "documents") {
    const [files, capability, bookings] = await Promise.all([
      db
        .from("booking_attachments")
        .select(
          "id,trip_id,booking_id,intake_id,filename,content_type,size,created_at,state,document_kind,display_name,document_category,documents_hidden,document_revision",
        )
        .eq("trip_id", trip.id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      db
        .from("booking_attachments")
        .select(
          "document_kind,display_name,document_category,documents_hidden,document_revision",
        )
        .eq("trip_id", trip.id)
        .limit(0),
      db.from("bookings").select("id,title").eq("trip_id", trip.id),
    ]);
    let data = files.data,
      error = files.error;
    // Missing new columns must not hide existing private booking confirmations.
    if (capability.error) {
      const legacy = await db
        .from("booking_attachments")
        .select(
          "id,trip_id,booking_id,filename,content_type,size,created_at,state",
        )
        .eq("trip_id", trip.id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      data = legacy.data as typeof data;
      error = legacy.error;
    }
    return (
      <DocumentsClient
        trip={trip}
        files={(data || []) as TripFile[]}
        bookingNames={Object.fromEntries(
          (bookings.data || []).map((b) => [b.id, b.title]),
        )}
        canEdit={canEdit}
        ready={!capability.error}
        loadError={
          error || bookings.error || tasks.error
            ? "Your saved documents could not be loaded. Reconnect and reload."
            : undefined
        }
        reminders={reminders}
      />
    );
  }
  const [lists, items, capability, templates, ownTrips, bookings] =
    await Promise.all([
      db.from("packing_lists").select("*").eq("trip_id", trip.id),
      db.from("packing_items").select("*").eq("trip_id", trip.id),
      db
        .from("packing_items")
        .select("notes,position,packing_revision")
        .eq("trip_id", trip.id)
        .limit(0),
      db.from("packing_templates").select("id,name").eq("owner_id", user.id),
      finalizedTrips(db, "id,name,owner_id"),
      db.from("bookings").select("category").eq("trip_id", trip.id),
    ]);
  const sourceIds = (ownTrips.data || [])
    .filter((t) => t.owner_id === user.id)
    .map((t) => t.id);
  const sources = sourceIds.length
    ? await db
        .from("packing_lists")
        .select("id,trip_id,traveler")
        .in("trip_id", sourceIds)
    : { data: [], error: null };
  const context = {
    days: dateRange(trip)?.count || 0,
    theme: trip.theme || "Default",
    destinations: [
      ...new Set([
        ...savedTripDestinations(trip).map((d) => d.label),
        ...segments
          .filter((s) => s.kind === "destination" && s.status !== "idea")
          .map((s) => s.title),
      ]),
    ],
    transportModes: [
      ...new Set([
        ...segments
          .filter((s) => s.kind === "transport" && s.status !== "idea")
          .map((s) => s.transport_mode),
        ...(bookings.data || [])
          .filter((b) => b.category === "flight")
          .map(() => "flight"),
      ]),
    ].filter(Boolean),
    hasBookings: !!bookings.data?.length,
  };
  const packingLists = (lists.data || []) as ManagedPackingList[],
    packingItems = (items.data || []) as ManagedPackingItem[];
  const suggestions = canEdit
    ? Object.fromEntries(
        packingLists.map((l) => [
          l.id,
          <PackingSuggestions
            key={l.id}
            tripId={trip.id}
            listId={l.id}
            existing={packingItems.filter((i) => i.list_id === l.id)}
            context={context}
            live={
              process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY)
            }
          />,
        ]),
      )
    : {};
  const templateForms = canEdit
    ? Object.fromEntries(
        packingLists.map((l) => [
          l.id,
          <form key={l.id} action={savePackingTemplate}>
            <input type="hidden" name="trip_id" value={trip.id} />
            <input type="hidden" name="list_id" value={l.id} />
            <label>
              Save this list as a template
              <input name="name" required maxLength={100} />
            </label>
            <Submit>Save template</Submit>
          </form>,
        ]),
      )
    : {};
  return (
    <PackingClient
      trip={trip}
      lists={packingLists}
      items={packingItems}
      canEdit={canEdit}
      ready={!capability.error}
      loadError={
        lists.error ||
        items.error ||
        tasks.error ||
        bookings.error ||
        templates.error ||
        ownTrips.error ||
        sources.error
          ? "Some packing data could not be loaded. Reconnect and reload."
          : undefined
      }
      copySources={(sources.data || []).map((l) => ({
        id: l.id,
        label:
          (ownTrips.data || []).find((t) => t.id === l.trip_id)?.name +
          " · " +
          l.traveler,
      }))}
      templateSources={(templates.data || []).map((t) => ({
        id: t.id,
        label: t.name,
      }))}
      suggestions={suggestions}
      templates={templateForms}
      reminders={reminders}
    />
  );
}
