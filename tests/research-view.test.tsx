// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Research } from "../components/research";
import type { ResearchNote } from "../lib/research-types";
vi.mock("../app/research-actions", () => ({
  saveResearchNote: vi.fn(),
  removeResearchNote: vi.fn(),
  researchToPrep: vi.fn(),
}));
vi.mock("../app/actions", () => ({
  saveTrip: vi.fn(),
  saveSegment: vi.fn(),
  deleteTrip: vi.fn(),
  deleteSegment: vi.fn(),
}));
afterEach(cleanup);
it("lets viewers read sources and uncertainty without editing controls or automatic requests", () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const trip = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Trip",
    start_date: "2027-05-01",
    end_date: "2027-05-10",
    timezone: "Asia/Tokyo",
    travelers: 1,
    style: "Comfort",
    currency: "EUR",
    budget: null,
  };
  const record: ResearchNote = {
    id: "22222222-2222-4222-8222-222222222222",
    trip_id: trip.id,
    destination_id: null,
    destination_label: "Tokyo",
    source_id: "jp-fcdo",
    source_name: "Official source",
    source_url:
      "https://www.gov.uk/foreign-travel-advice/japan/entry-requirements",
    retrieved_at: "2020-01-01T00:00:00Z",
    reviewed_at: "2020-01-01T00:00:00Z",
    created_at: "2020-01-01T00:00:00Z",
    source_excerpt: "Fixture reviewed source excerpt.",
    title: "Check applicable guidance",
    note: "",
    context: {
      nationality: "Romanian",
      document: "ordinary passport",
      purpose: "tourism",
      travel_start: trip.start_date,
      travel_end: trip.end_date,
    },
  };
  render(
    <Research trip={trip} destinations={[]} notes={[record]} canEdit={false} />,
  );
  expect(screen.getByText("Fixture reviewed source excerpt.")).toBeTruthy();
  expect(screen.getByText(/30 days ago/)).toBeTruthy();
  expect(
    screen.getByText(/No automated eligibility verification/),
  ).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(
    screen.getByRole("link", { name: /Official source/ }).getAttribute("href"),
  ).toBe(record.source_url);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});
