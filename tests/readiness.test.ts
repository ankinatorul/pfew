import { it, expect, vi, afterEach } from "vitest";
import { packingStarter, prepStarter, withoutExisting } from "../lib/readiness";
import { OpenAIPackingProvider, packingProvider } from "../lib/packing-ai";
const context = {
  days: 10,
  destinations: ["Tokyo"],
  transportModes: ["flight"],
  hasBookings: true,
};
afterEach(() => vi.unstubAllEnvs());
it("bases quantities on chosen clothing days, not traveler counts or invented weather", () => {
  const items = packingStarter(context, 4);
  expect(
    items.find((item) => item.title === "Everyday clothing")?.quantity,
  ).toBe(4);
  expect(
    items.some((item) => item.title === "Small essentials for your flight"),
  ).toBe(true);
  expect(JSON.stringify(items)).not.toMatch(
    /forecast|sunny|rainy|kg allowance/,
  );
  expect(() => packingStarter(context, 0)).toThrow();
});
it("skips case/whitespace matching items and completed tasks without resetting them", () => {
  const existing = [{ title: " CHARGING   cable ", packed: true }];
  expect(
    withoutExisting(packingStarter(context, 4), existing).some(
      (item) => item.title === "Charging cable",
    ),
  ).toBe(false);
  expect(existing[0].packed).toBe(true);
  const tasks = prepStarter(context);
  expect(tasks.every((item) => item.due_date === "")).toBe(true);
  const existingTasks = [{ title: tasks[0].title, done: true }];
  expect(
    withoutExisting(tasks, existingTasks).some(
      (item) => item.title === tasks[0].title,
    ),
  ).toBe(false);
});
it("keeps AI context minimal, bounded and explicitly non-stored", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  title: "Charging cable",
                  category: "Electronics",
                  quantity: 1,
                  reason: "Consider your devices.",
                },
              ],
            }),
          },
        },
      ],
    }),
  );
  const result = await new OpenAIPackingProvider(
    "test-secret",
    "test-model",
    fetcher,
  ).suggest(context, 4);
  expect(result[0].quantity).toBe(1);
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body.max_completion_tokens).toBe(1200);
  expect(body.store).toBe(false);
  expect(Object.keys(JSON.parse(body.messages[1].content)).sort()).toEqual([
    "clothingDays",
    "days",
    "destinations",
    "transportModes",
  ]);
  vi.stubEnv("AI_API_KEY", "");
  expect(() => packingProvider()).toThrow("not configured");
});
it("rejects invented citations in AI suggestions instead of showing a fallback claim", async () => {
  const provider = new OpenAIPackingProvider(
    "key",
    "model",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  {
                    title: "Thing",
                    category: "Other",
                    quantity: 1,
                    reason: "See https://invented.example",
                  },
                ],
              }),
            },
          },
        ],
      }),
    ),
  );
  await expect(provider.suggest(context, 4)).rejects.toThrow();
});
