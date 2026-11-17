import React from "react";
import { createRoot } from "react-dom/client";
import { TripMapCard, TripExplorer } from "../../components/trip-map";
import { tripMapData } from "../../lib/trip-map";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./trip-overview";
const data = tripMapData(
  { ...overviewTrip, name: "Thailand discovery" },
  [
    overviewSegment({
      id: "bangkok",
      kind: "destination",
      title: "Bangkok",
      latitude: 13.7563,
      longitude: 100.5018,
      position: 0,
    }),
    overviewSegment({
      id: "krabi",
      kind: "destination",
      title: "Krabi",
      latitude: 8.0863,
      longitude: 98.9063,
      position: 1,
    }),
    overviewSegment({
      id: "lanta",
      kind: "destination",
      title: "Koh Lanta",
      latitude: 7.6,
      longitude: 99.07,
      position: 2,
    }),
    overviewSegment({
      id: "activity",
      kind: "activity",
      title: "Saved beach walk",
      destination_id: "lanta",
      latitude: 7.61,
      longitude: 99.05,
    }),
  ],
  [
    {
      ...overviewBooking(),
      id: "hotel",
      title: "Saved accommodation",
      latitude: 7.62,
      longitude: 99.06,
    },
  ],
  [],
);
const mode = new URL(location.href).searchParams.get("mode");
createRoot(document.getElementById("fixture-root")!).render(
  <main
    className="trip-overview"
    style={{ padding: 20, background: "#f6f6f8", minHeight: "100vh" }}
  >
    {mode === "explorer" ? (
      <TripExplorer data={data} canEdit={false} />
    ) : (
      <TripMapCard data={data} />
    )}
  </main>,
);
