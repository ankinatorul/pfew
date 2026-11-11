// Browser-only fixture: real UI and selection logic, isolated in-memory actions.
import React from "react";
import { createRoot } from "react-dom/client";
import Link from "next/link";
import { TripEdit } from "../../components/trip-edit";
import { TripOverviewView } from "../../components/trip-overview-view";
import { AppShell } from "../../components/app-shell";
import type { TripOverview } from "../../lib/trip-overview";
import { overviewTrip as trip } from "./trip-overview";
declare const __TRIP_OVERVIEW_FIXTURE__: TripOverview;

const other = {
  ...trip,
  id: "88888888-8888-4888-8888-888888888888",
  name: "Another fixture journey",
  shared: false,
  lifecycle: "upcoming" as const,
};
const root = createRoot(document.getElementById("fixture-root")!);
declare global {
  interface Window {
    tripManagementFixture: {
      calls: { action: string; id: string; name?: string }[];
      failure: boolean;
      lastTrip: boolean;
      deleted: boolean;
      navigate: (href: string) => void;
      remove: (form: FormData) => Promise<{ error: string } | undefined>;
      save: (form: FormData) => Promise<void>;
    };
  }
}
window.tripManagementFixture = {
  calls: [],
  failure: false,
  lastTrip: false,
  deleted: false,
  navigate(href) {
    history.replaceState(null, "", href);
    render();
  },
  async remove(form) {
    this.calls.push({ action: "delete", id: String(form.get("id")) });
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (this.failure)
      return {
        error:
          "Other travelers have private documents attached. Your trip is still saved.",
      };
    this.deleted = true;
    this.navigate("/trips");
  },
  async save(form) {
    this.calls.push({
      action: "save",
      id: String(form.get("id")),
      name: String(form.get("name")),
    });
    this.navigate("/trips/" + trip.id);
  },
};
function render() {
  const fixture = window.tripManagementFixture;
  const query = new URLSearchParams(location.search);
  const editing = query.get("view") === "settings";
  const listing = location.pathname === "/trips";
  const trips = [
    ...(fixture.deleted
      ? []
      : [{ ...trip, shared: false, lifecycle: "upcoming" as const }]),
    ...(fixture.lastTrip ? [] : [other]),
  ];
  root.render(
    <AppShell
      userId="browser-fixture-owner"
      profile={{
        name: "Fixture Traveler",
        email: null,
        avatarUrl: null,
        initials: "FT",
      }}
      trips={trips}
      unavailable={false}
      fallbackId={trips[0]?.id || null}
    >
      {listing ? (
        <h1>My Trips</h1>
      ) : editing ? (
        <TripEdit trip={trip} day="2027-05-03" LinkComponent={Link} />
      ) : (
        <TripOverviewView
          model={__TRIP_OVERVIEW_FIXTURE__}
          role="owner"
          LinkComponent={Link}
        />
      )}
    </AppShell>,
  );
}
render();
