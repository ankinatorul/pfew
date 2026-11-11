import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { savedIdeaDate } from "../lib/idea-dates";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("redirect:" + decodeURIComponent(url));
  },
}));
import {
  acceptSuggestion,
  placeToIdea,
  generateSuggestions,
} from "../app/intelligence-actions";
const tripId = "11111111-1111-4111-8111-111111111111";
const ideaId = "22222222-2222-4222-8222-222222222222";
let trip: {
  start_date: string | null;
  end_date: string | null;
  timezone: string;
};
let suggestion: { id: string; accepted_segment_id: string | null };
beforeEach(() => {
  trip = { start_date: "2027-06-01", end_date: "2027-06-10", timezone: "UTC" };
  suggestion = { id: ideaId, accepted_segment_id: null };
  mocks.rpc.mockResolvedValue({ data: ideaId, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.access.mockResolvedValue({
    db: {
      rpc: mocks.rpc,
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => ({
            data:
              table === "trips"
                ? trip
                : table === "ai_suggestions"
                  ? suggestion
                  : {
                      title: "Saved place",
                      notes: "User notes",
                      location_id: null,
                      google_place_id: null,
                      latitude: null,
                      longitude: null,
                    },
            error: null,
          }),
          insert: mocks.insert,
        };
        return query;
      },
    },
  });
});
afterEach(() => vi.clearAllMocks());
function form() {
  const value = new FormData();
  value.set("trip_id", tripId);
  value.set("suggestion_id", ideaId);
  value.set("place_id", ideaId);
  return value;
}
it("blocks undated/partial/invalid legacy records without discarding suggestions, places or inventing dates", async () => {
  for (const dates of [
    { start_date: null, end_date: null },
    { start_date: "2027-06-01", end_date: null },
    { start_date: null, end_date: "2027-06-10" },
    { start_date: "2027-06-12", end_date: "2027-06-10" },
    { start_date: "2027-02-30", end_date: "2027-06-10" },
  ]) {
    trip = { ...trip, ...dates };
    expect(savedIdeaDate(trip)).toBeNull();
    await expect(acceptSuggestion(form())).rejects.toThrow(
      /Add valid departure and return dates/,
    );
    await expect(placeToIdea(form())).rejects.toThrow(/still saved/);
    expect(suggestion.accepted_segment_id).toBeNull();
    expect(trip).toMatchObject(dates);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
it("preserves the existing authorized dated idea workflow and same-day trips", async () => {
  for (const end of ["2027-06-01", "2027-06-10"]) {
    trip.end_date = end;
    await expect(acceptSuggestion(form())).rejects.toThrow("?view=ideas");
    expect(mocks.rpc).toHaveBeenLastCalledWith("accept_ai_idea", {
      suggestion: ideaId,
    });
  }
  await expect(placeToIdea(form())).rejects.toThrow("?view=ideas");
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      start_date: "2027-06-01",
      end_date: "2027-06-01",
      status: "idea",
    }),
  );
});
it("keeps already accepted suggestions idempotent and failed accepts recoverable", async () => {
  suggestion.accepted_segment_id = ideaId;
  trip.start_date = null;
  await expect(acceptSuggestion(form())).rejects.toThrow("?view=ideas");
  expect(mocks.rpc).not.toHaveBeenCalled();
  suggestion.accepted_segment_id = null;
  trip.start_date = "2027-06-01";
  mocks.rpc.mockResolvedValue({ error: { message: "IDEA_DATE_REQUIRED" } });
  await expect(acceptSuggestion(form())).rejects.toThrow(
    /Add valid departure and return dates/,
  );
  expect(suggestion.accepted_segment_id).toBeNull();
  mocks.rpc.mockResolvedValue({ error: { message: "private database error" } });
  await expect(acceptSuggestion(form())).rejects.toThrow(
    /Your suggestion is still saved/,
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("does not reserve or send a provider request for incomplete legacy dates", async () => {
  trip.end_date = null;
  const input = form();
  input.set("mode", "live");
  input.set("request", "A relaxed evening");
  input.set("destination_id", "");
  await expect(generateSuggestions(input)).rejects.toThrow(
    /No suggestion request has been made/,
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
