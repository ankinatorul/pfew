import { afterEach, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  extractLabeledText,
  OpenAIBookingExtractor,
  liveBookingExtractor,
} from "../lib/booking-extraction";
import { importFieldNames, bookingDraft } from "../lib/booking-import-types";
import { importDocument } from "../lib/import-document";
afterEach(() => vi.unstubAllEnvs());
it("reads only unambiguous labeled fields and leaves unknown dates, currency and payment blank", () => {
  const result = extractLabeledText(
    "Booking name: My flight\nCategory: flight\nProvider: Example airline\nBooking reference: ABC123\nStart date: 2027-05-01\nStart time: 09:30\nTotal price: 120.50\nRandom amount: 999\nPassport number: PRIVATE123",
  );
  expect(result.fields).toMatchObject({
    title: "My flight",
    category: "flight",
    provider: "Example airline",
    reference: "ABC123",
    start_date: "2027-05-01",
    local_time: "09:30",
    price: 120.5,
    end_date: null,
    currency: null,
    paid_amount: null,
  });
  expect(result.evidence.reference).toBe("Booking reference: ABC123");
  expect(JSON.stringify(result)).not.toContain("PRIVATE123");
  const draft = bookingDraft({ ...result, importKey: crypto.randomUUID() });
  expect(draft.end_date).toBe("");
  expect(draft.currency).toBe("");
  expect(draft.payment_status).toBe("unknown");
});
it("rejects conflicting or ambiguous dates and money rather than guessing", () => {
  const result = extractLabeledText(
    "Booking reference: AAA\nBooking reference: BBB\nStart date: 03/04/2027\nEnd date: 2027-02-30\nCurrency: $\nTotal price: 1,000.00",
  );
  expect(Object.values(result.fields).every((value) => value === null)).toBe(
    true,
  );
  expect(result.warnings.join(" ")).toContain("Conflicting");
  expect(() => extractLabeledText("x".repeat(16001))).toThrow();
});
it("grounds AI text values in supplied evidence and uses non-stored bounded Responses requests", async () => {
  const fields = {
    ...Object.fromEntries(importFieldNames.map((key) => [key, null])),
    provider: "Example airline",
    reference: "INVENTED",
    currency: "USD",
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                fields,
                evidence: {
                  provider: "Provider: Example airline",
                  reference: "Missing quote",
                  currency: "$",
                },
                warnings: [],
              }),
            },
          ],
        },
      ],
    }),
  );
  const extractor = new OpenAIBookingExtractor(
    "test-secret",
    "test-model",
    fetcher,
  );
  const result = await extractor.extract({
    text: "Provider: Example airline\nTotal price: $100",
  });
  expect(result.fields.provider).toBe("Example airline");
  expect(result.fields.reference).toBeNull();
  expect(result.fields.currency).toBeNull();
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/responses");
  const body = JSON.parse(String(options?.body));
  expect(body.store).toBe(false);
  expect(body.max_output_tokens).toBe(1800);
  expect(body.input[0].content[0].text).toContain("Provider: Example airline");
});
it("supports document input without treating extracted fields as verified", async () => {
  const fields = Object.fromEntries(importFieldNames.map((key) => [key, null]));
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                fields: { ...fields, reference: "ABC" },
                evidence: { reference: "Confirmation ABC" },
                warnings: [],
              }),
            },
          ],
        },
      ],
    }),
  );
  const result = await new OpenAIBookingExtractor(
    "secret",
    "model",
    fetcher,
  ).extract({ document: { mime: "application/pdf", base64: "TEST" } });
  expect(result.fields.reference).toBe("ABC");
  expect(result.warnings.join(" ")).toContain("unverified");
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).input[0].content[1]
      .filename,
  ).toBe("booking.pdf");
  vi.stubEnv("AI_API_KEY", "");
  expect(() => liveBookingExtractor()).toThrow("not configured");
});
it("limits PDF page count and rejects spoofed or unreadable files before provider calls", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const accepted = await importDocument(
    new File([bytes as Uint8Array<ArrayBuffer>], "private-name.pdf", {
      type: "application/pdf",
    }),
  );
  expect(accepted.mime).toBe("application/pdf");
  for (let i = 0; i < 5; i++) pdf.addPage();
  await expect(
    importDocument(
      new File([(await pdf.save()) as Uint8Array<ArrayBuffer>], "many.pdf", {
        type: "application/pdf",
      }),
    ),
  ).rejects.toThrow("five");
  await expect(
    importDocument(
      new File(["not pdf"], "fake.pdf", { type: "application/pdf" }),
    ),
  ).rejects.toThrow("contents");
  await expect(
    importDocument(
      new File(["%PDF-damaged"], "broken.pdf", { type: "application/pdf" }),
    ),
  ).rejects.toThrow("could not be read");
});
