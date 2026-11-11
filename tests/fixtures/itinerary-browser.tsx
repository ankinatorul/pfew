import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShellView } from "../../components/app-shell-view";
import { ItineraryView } from "../../components/itinerary-view";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./trip-overview";
import {
  activityValues,
  type ItineraryActivity,
  type ItineraryIdea,
  type ItineraryCommand,
} from "../../lib/itinerary";
const trip = {
  ...overviewTrip,
  name: "A little Paris & Rome",
  timezone: "Europe/Paris",
  draft_data: {
    destinations: [
      {
        id: "saved-paris",
        label: "Paris, France",
        city: "Paris",
        country: "France",
        latitude: 48.85,
        longitude: 2.35,
        timezone: "Europe/Paris",
        source: "coordinates",
      },
      {
        id: "saved-rome",
        label: "Rome, Italy",
        city: "Rome",
        country: "Italy",
        latitude: 41.9,
        longitude: 12.5,
        timezone: "Europe/Rome",
        source: "coordinates",
      },
    ],
  },
};
const card = { ...trip, shared: false, lifecycle: "upcoming" as const };
function Fixture() {
  const params = new URLSearchParams(location.search),
    mode = params.get("mode"),
    key = "fixture:itinerary:" + mode;
  const initial =
    mode === "empty"
      ? { segments: [], bookings: [], ideas: [] }
      : {
          segments: [
            {
              ...overviewSegment({
                kind: "activity",
                end_date: trip.start_date,
                title: "A quiet morning walk",
                timezone: "Europe/Paris",
                local_time: "09:00",
                duration_minutes: 60,
                address: "A saved meeting point",
                notes: "Leave room for a relaxed start.",
              }),
              itinerary_revision: 0,
              activity_category: "Relaxation",
            },
            {
              ...overviewSegment({
                id: "55555555-5555-4555-8555-555555555555",
                kind: "activity",
                end_date: trip.start_date,
                title: "Browse a local bookshop",
                timezone: "Europe/Paris",
                position: 1,
              }),
              itinerary_revision: 0,
            },
            {
              ...overviewSegment({
                id: "66666666-6666-4666-8666-666666666666",
                kind: "activity",
                end_date: trip.start_date,
                title: "A café stop",
                timezone: "Europe/Paris",
                position: 2,
              }),
              itinerary_revision: 0,
            },
          ],
          bookings: [
            overviewBooking({
              title: "Saved museum booking",
              category: "activity",
              start_date: trip.start_date,
              end_date: trip.start_date,
              local_time: "11:00",
              end_local_time: "12:00",
              timezone: "Europe/Paris",
              end_timezone: "Europe/Paris",
              verification: "unverified",
              reservation_status: "confirmed",
            }),
          ],
          ideas: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              title: "Leave an afternoon for art",
              note: "Consider a gallery visit if it fits your interests. Check opening hours and tickets yourself.",
              category: "activity",
              source: "ai" as const,
              dismissed: false,
              accepted_segment_id: null,
              context: {
                day: trip.start_date,
                destination: "Paris, France",
                destination_id: "saved-paris",
              },
            },
          ],
        };
  const [store, setStore] = useState<{
      segments: ItineraryActivity[];
      bookings: ReturnType<typeof overviewBooking>[];
      ideas: ItineraryIdea[];
    }>(() => JSON.parse(sessionStorage.getItem(key) || "null") || initial),
    [failed, setFailed] = useState(false);
  const commit = (next: typeof store) => {
    sessionStorage.setItem(key, JSON.stringify(next));
    setStore(next);
  };
  async function mutate(c: ItineraryCommand) {
    await new Promise((r) => setTimeout(r, 80));
    if (mode === "failure" && !failed) {
      setFailed(true);
      return {
        error:
          "The item changed or could not be saved. Your input is preserved.",
      };
    }
    const next = structuredClone(store);
    if (c.op === "save") {
      const v = activityValues(c.input, trip, next.segments),
        old = next.segments.find((s) => s.id === v.id);
      if (old && old.itinerary_revision !== v.revision)
        return { error: "This activity changed. Reload before saving." };
      const row = {
        ...(old ||
          overviewSegment({
            id: v.id,
            kind: "activity",
            end_date: trip.start_date,
            position: next.segments.length,
          })),
        title: v.title,
        start_date: v.day,
        end_date: v.day,
        local_time: v.start,
        duration_minutes: v.duration_minutes,
        timezone: v.timezone,
        address: v.location,
        notes: v.notes,
        activity_category: v.category,
        destination_location_id: v.destination,
        itinerary_revision: old ? (old.itinerary_revision || 0) + 1 : 0,
      };
      next.segments = next.segments.filter((s) => s.id !== row.id).concat(row);
    }
    if (c.op === "delete") {
      next.segments = next.segments.filter((s) => s.id !== c.id);
      next.bookings = next.bookings.map((b) =>
        b.segment_id === c.id ? { ...b, segment_id: null } : b,
      );
    }
    if (c.op === "reorder")
      c.order.forEach((entry, i) => {
        const s = next.segments.find((s) => s.id === entry.id)!;
        s.position = i;
        s.itinerary_revision = (s.itinerary_revision || 0) + 1;
      });
    if (c.op === "unlink")
      next.bookings = next.bookings.map((b) =>
        b.id === c.id ? { ...b, segment_id: null } : b,
      );
    if (c.op === "complete")
      next.segments = next.segments.map((s) =>
        s.id === c.id
          ? {
              ...s,
              completed_at: s.completed_at ? null : new Date().toISOString(),
              itinerary_revision: (s.itinerary_revision || 0) + 1,
            }
          : s,
      );
    if (c.op === "dismiss-idea")
      next.ideas = next.ideas.map((i) =>
        i.id === c.id ? { ...i, dismissed: true } : i,
      );
    if (c.op === "add-idea") {
      const idea = next.ideas.find((i) => i.id === c.id)!;
      if (!idea.accepted_segment_id) {
        const id = crypto.randomUUID();
        idea.accepted_segment_id = id;
        next.segments.push({
          ...overviewSegment({
            id,
            kind: "activity",
            title: idea.title,
            notes: idea.note,
            start_date: c.day,
            end_date: c.day,
          }),
          itinerary_revision: 0,
        });
      }
    }
    commit(next);
    return { message: "Saved." };
  }
  return (
    <AppShellView
      trips={[card]}
      activeTrip={card}
      pathname={"/trips/" + trip.id}
      view="itinerary"
      day={null}
      accountMenu={<span>Isolated fixture</span>}
    >
      <ItineraryView
        trip={trip}
        {...store}
        canEdit={mode !== "viewer"}
        ready={mode !== "pending"}
        live={mode === "live-fixture"}
        today="2027-05-10"
        pendingBookings={1}
        initialExplore={mode !== "empty"}
        mutate={mutate}
        explore={async () => ({
          message:
            "No new ideas found. Try different interests or add your own activity.",
        })}
      />
    </AppShellView>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
