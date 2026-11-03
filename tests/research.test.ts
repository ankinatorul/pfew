import { it, expect, vi } from "vitest";
import { officialSource, sourcesForLocation } from "../lib/research-catalog";
import {
  retrieveOfficialSource,
  normalizeExcerpt,
} from "../lib/official-research";
import { researchStaleness } from "../lib/research-types";
it("only fetches fixed official catalog URLs with redirects disabled and bounded text", async () => {
  const text =
    "Current guidance must be checked for the traveler and dates. ".repeat(5);
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        "<html><body><nav>REMOVE NAV</nav><main><h1>Entry guidance</h1><script>PRIVATE SCRIPT</script><p>" +
          text +
          "</p></main></body></html>",
        { headers: { "Content-Type": "text/html" } },
      ),
  );
  const result = await retrieveOfficialSource("jp-fcdo", fetcher);
  expect(result.source.url).toBe(
    "https://www.gov.uk/foreign-travel-advice/japan/entry-requirements",
  );
  expect(result.text).toContain("Current guidance");
  expect(result.text).not.toContain("PRIVATE SCRIPT");
  expect(result.text).not.toContain("REMOVE NAV");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    cache: "no-store",
  });
  await expect(
    retrieveOfficialSource("https://127.0.0.1/private", fetcher),
  ).rejects.toThrow("supported");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sourcesForLocation("city:JP:1:2")).toHaveLength(2);
  expect(sourcesForLocation("city:XX:1:2")).toEqual([]);
  expect(officialSource("not-a-source")).toBeNull();
});
it("rejects oversized pages, unavailable sources and bot challenges without generating guidance", async () => {
  for (const response of [
    new Response("no", { status: 403 }),
    new Response("a".repeat(524289), {
      headers: { "Content-Type": "text/html" },
    }),
    new Response("not html", {
      headers: { "Content-Type": "application/pdf" },
    }),
    new Response("<body>Just a moment " + ".".repeat(120) + "</body>", {
      headers: { "Content-Type": "text/html" },
    }),
  ])
    await expect(
      retrieveOfficialSource(
        "jp-entry",
        vi.fn<typeof fetch>(async () => response),
      ),
    ).rejects.toThrow();
  expect(normalizeExcerpt(" exact \n source  quote ")).toBe(
    "exact source quote",
  );
});
it("flags stale or changed research context without claiming eligibility", () => {
  const trip = { start_date: "2027-05-01", end_date: "2027-05-10" },
    context = {
      nationality: "Romanian",
      document: "ordinary passport" as const,
      purpose: "tourism" as const,
      travel_start: trip.start_date,
      travel_end: trip.end_date,
    };
  const record = { retrieved_at: "2027-04-20T00:00:00.000Z", context };
  expect(
    researchStaleness(
      {
        ...record,
        context: {
          ...context,
          travel_start: "2027-05-03",
          travel_end: "2027-05-07",
        },
      },
      trip,
      new Date("2027-04-21"),
    ),
  ).toBeNull();
  expect(researchStaleness(record, trip, new Date("2027-04-21"))).toBeNull();
  expect(researchStaleness(record, trip, new Date("2027-06-01"))).toContain(
    "30 days",
  );
  expect(
    researchStaleness(
      record,
      { ...trip, start_date: "2027-05-02" },
      new Date("2027-04-21"),
    ),
  ).toContain("falls outside");
});
