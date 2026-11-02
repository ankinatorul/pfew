import { afterEach, it, expect, vi } from "vitest";
import {
  MockAI,
  OpenAIProvider,
  aiProvider,
  suggestionsSchema,
} from "../lib/ai";
afterEach(() => vi.unstubAllEnvs());
const context = {
  tripName: "Trip",
  destination: "Tokyo",
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
  travelers: 2,
  days: 5,
  request: "A relaxed first day",
};
it("provides clearly identified sample ideas with no fabricated venues or prices", async () => {
  const ideas = await new MockAI().suggest(context);
  expect(ideas.length).toBeGreaterThan(0);
  expect(ideas.every((i) => i.note.includes("Sample suggestion"))).toBe(true);
  expect(ideas[0].note).toContain(
    "No venue, price or availability has been checked",
  );
});
it("does not silently use mock responses when a live key is missing", () => {
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("AI_API_KEY", "");
  expect(() => aiProvider("live")).toThrow("not configured");
});
it("validates live provider responses and sends only bounded structured context", async () => {
  const fake = vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                {
                  title: "A flexible evening",
                  note: "Consider leaving space to rest.",
                  category: "relaxation",
                },
              ],
            }),
          },
        },
      ],
    }),
  );
  const provider = new OpenAIProvider("test-secret", "test-model", fake);
  expect((await provider.suggest(context))[0].title).toBe("A flexible evening");
  const body = JSON.parse(String(fake.mock.calls[0][1]?.body));
  expect(body.max_completion_tokens).toBe(900);
  expect(body.messages[1].content).not.toContain("booking reference");
});
it("rejects invented citations and unsupported provider results", async () => {
  expect(
    suggestionsSchema.safeParse({
      suggestions: [
        {
          title: "A place",
          note: "See https://invented.example",
          category: "activity",
        },
      ],
    }).success,
  ).toBe(false);
  const provider = new OpenAIProvider(
    "test",
    "model",
    vi.fn<typeof fetch>(async () => new Response("bad", { status: 503 })),
  );
  await expect(provider.suggest(context)).rejects.toThrow("unavailable");
});
