"use client";
import { useRef, useState, type DragEvent } from "react";
// Use the existing website routes throughout setup.
const Link = "a";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { LocationPicker } from "../location-picker";
import { useOnline } from "../essentials/online";
import {
  interests,
  emptyCandidate,
  candidateComplete,
  type Candidate,
  type OnboardingInput,
} from "../../lib/onboarding";
import {
  importResultSchema,
  importFieldNames,
  importLabels,
} from "../../lib/booking-import-types";
import { categories } from "../../lib/essentials";
import { friendlyDate, friendlyDateRange } from "../../lib/journey";
type Source = {
  id: string;
  file: File;
  status: "waiting" | "reading" | "done" | "failed" | "skipped";
  error?: string;
  candidateId?: string;
};
function SetupDate({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="onboarding-date-field">
      {label}
      <div>
        <input
          type="date"
          aria-label={label}
          required
          value={value}
          min={min}
          onChange={(event) => onChange(event.target.value)}
        />
        <span aria-hidden="true">
          {value ? friendlyDate(value, true) : "Choose date"}
        </span>
      </div>
    </label>
  );
}
export function TripOnboarding({
  live,
  schemaReady = true,
}: {
  live: boolean;
  schemaReady?: boolean;
}) {
  const online = useOnline();
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [destinations, setDestinations] = useState<
      OnboardingInput["destinations"]
    >([]),
    [bookings, setBookings] = useState<Candidate[]>([]),
    [files, setFiles] = useState<Source[]>([]);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [style, setStyle] = useState<OnboardingInput["style"]>("Comfort");
  const [selectedInterests, setInterests] = useState<
      OnboardingInput["interests"]
    >([]),
    [travelers, setTravelers] = useState(1),
    [budget, setBudget] = useState(""),
    [currency, setCurrency] = useState("EUR"),
    [pace, setPace] = useState<OnboardingInput["pace"]>("Flexible");
  const [result, setResult] = useState<{
    trip: { id: string; name: string; start_date: string; end_date: string };
    href: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const requestId = useRef<string | null>(null),
    submittedBody = useRef<string | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const included = bookings.filter((b) => b.included),
    pending = included.filter((b) => !candidateComplete(b));
  const flightOnly =
    included.length > 0 &&
    included.every((b) => b.fields.category === "flight");
  function go(next: number) {
    setError("");
    setStep(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      window.scrollTo({ top: 0 });
    });
  }
  function addFiles(list: FileList | File[]) {
    if (busy) return;
    const incoming = Array.from(list);
    if (files.length + incoming.length > 8) {
      setError("Choose up to eight files per setup.");
      return;
    }
    if (
      incoming.some(
        (f) =>
          !["application/pdf", "image/jpeg", "image/png"].includes(f.type) ||
          !f.size ||
          f.size > 3 * 1024 * 1024,
      )
    ) {
      setError("Choose PDF, JPEG or PNG files, each up to 3 MB.");
      return;
    }
    setFiles((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "waiting" as const,
      })),
    ]);
    setError("");
  }
  async function readFiles() {
    if (!online || !consent || !live || busy) return;
    if (
      bookings.length +
        files.filter((f) => ["waiting", "failed"].includes(f.status)).length >
      20
    ) {
      setError(
        "Keep up to 20 booking previews. Remove a booking or source before reading more.",
      );
      return;
    }
    setBusy(true);
    setError("");
    for (const source of files.filter((f) =>
      ["waiting", "failed"].includes(f.status),
    )) {
      setFiles((current) =>
        current.map((f) =>
          f.id === source.id
            ? { ...f, status: "reading", error: undefined }
            : f,
        ),
      );
      try {
        const form = new FormData();
        form.set("file", source.file);
        form.set("mode", "ai");
        form.set("consent", "yes");
        const response = await fetch("/api/onboarding/extract", {
          method: "POST",
          body: form,
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Document reading unavailable.");
        const parsed = importResultSchema.parse(data);
        setBookings((current) => [
          ...current,
          {
            ...emptyCandidate(),
            id: parsed.importKey,
            fields: parsed.fields,
            evidence: parsed.evidence,
            warnings: parsed.warnings,
            method: parsed.method,
          },
        ]);
        setFiles((current) =>
          current.map((f) =>
            f.id === source.id
              ? { ...f, status: "done", candidateId: parsed.importKey }
              : f,
          ),
        );
      } catch (reason) {
        setFiles((current) =>
          current.map((f) =>
            f.id === source.id
              ? {
                  ...f,
                  status: "failed",
                  error:
                    reason instanceof Error && reason.name !== "ZodError"
                      ? reason.message
                      : "This source could not be read.",
                }
              : f,
          ),
        );
      }
    }
    setBusy(false);
  }
  function next() {
    if (step === 0 && (!start || !end || end < start)) {
      setError(
        "Choose departure and return dates. Return must be on or after departure.",
      );
      return;
    }
    if (step === 1) {
      if (files.some((f) => !["done", "skipped"].includes(f.status))) {
        setError(
          "Read the selected files, or skip/remove each unread file before continuing.",
        );
        return;
      }
      if (
        destinations.some(
          (d) =>
            !d.locationId || d.start < start || d.end > end || d.end < d.start,
        )
      ) {
        setError(
          "Choose each destination from the city results, with dates within your trip.",
        );
        return;
      }
    }
    if (step === 2 && included.some((b) => !b.reviewed)) {
      setError(
        "Review each included booking, or uncheck Include this booking. Missing fields can stay unknown.",
      );
      return;
    }
    go(step + 1);
  }
  async function create() {
    if (!online || busy || !schemaReady) return;
    setBusy(true);
    setError("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    if (!submittedBody.current) {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      submittedBody.current = JSON.stringify({
        requestId: requestId.current,
        name,
        start,
        end,
        timezone,
        travelers,
        style,
        currency,
        budget: budget === "" ? null : Number(budget),
        destinations,
        bookings,
        interests: selectedInterests,
        pace,
      });
    }
    setSubmitted(true);
    try {
      const response = await fetch("/api/onboarding/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: submittedBody.current,
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          submittedBody.current = null;
          setSubmitted(false);
        }
        throw new Error(
          data.error || "Creation unavailable. Retry to recover the same trip.",
        );
      }
      setResult(data);
      setFiles([]);
      go(4);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Connection interrupted. Retry to recover the same trip.",
      );
    } finally {
      setBusy(false);
    }
  }
  const titles = [
    "Let’s start with your trip.",
    "Got anything booked?",
    "Let’s check the details.",
    "Make it your kind of trip.",
    flightOnly ? "A great start." : "Your trip, organized.",
  ];
  const descriptions = [
    "Give your adventure a name. We’ll take it from there.",
    "A flight, a stay, or just one confirmation? Start with whatever you have.",
    "Review what was found. You can add anything missing later.",
    "A few preferences to make this your kind of adventure.",
    flightOnly
      ? "Your flight is a starting point. Add the rest whenever you’re ready."
      : "All your plans in one place. Add the little details whenever you’re ready.",
  ];
  function updateBooking(id: string, changes: Partial<Candidate>) {
    setBookings((current) =>
      current.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    );
  }
  return (
    <div className="pfew-onboarding">
      <section className="onboarding-panel" aria-label="New trip setup">
        <div className="onboarding-top">
          {step < 4 && (
            <Link
              href="/"
              className="onboarding-close"
              aria-label="Leave trip setup"
            >
              <X size={18} />
            </Link>
          )}
        </div>
        <p className="onboarding-step">
          Trip setup / {step + 1} of 5 ·{" "}
          {
            [
              "Trip basics",
              "Your bookings",
              "Review details",
              "Personalize",
              "Your workspace",
            ][step]
          }
        </p>
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label="Trip setup progress"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={step + 1}
        >
          <span style={{ width: `${(step + 1) * 20}%` }} />
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {titles[step]}
        </h1>
        <p className="onboarding-description">{descriptions[step]}</p>
        <div className="onboarding-content" data-step={step}>
          {step === 0 && (
            <div className="onboarding-basics">
              <label>
                Trip name
                <input
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summer in Japan"
                  autoComplete="off"
                />
              </label>
              <div className="onboarding-two">
                <SetupDate
                  label="Departure"
                  value={start}
                  onChange={setStart}
                />
                <SetupDate
                  label="Return"
                  value={end}
                  min={start}
                  onChange={setEnd}
                />
              </div>
            </div>
          )}
          {step === 1 && (
            <>
              <div className="onboarding-booking-paths">
                <div className="onboarding-upload-path">
                  <div
                    className="onboarding-dropzone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event: DragEvent) => {
                      event.preventDefault();
                      addFiles(event.dataTransfer.files);
                    }}
                  >
                    <div>
                      <ArrowUp size={30} aria-hidden="true" />
                      <h2>Drop your bookings here</h2>
                      <p>Flights, stays, transfers · PDFs or screenshots</p>
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        disabled={busy}
                      >
                        or browse files
                      </button>
                      <input
                        ref={fileInput}
                        className="sr-only"
                        aria-label="Booking PDFs or screenshots"
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png"
                        disabled={busy}
                        onChange={(event) => {
                          if (event.target.files) addFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  {files.map((source) => (
                    <div className="onboarding-source" key={source.id}>
                      <span>
                        {source.file.name}
                        <small>
                          {source.status === "done"
                            ? "Read · review required"
                            : source.status === "reading"
                              ? "Reading…"
                              : source.status === "skipped"
                                ? "Skipped · original not stored"
                                : source.status === "failed"
                                  ? source.error
                                  : "Ready to read"}
                        </small>
                      </span>
                      {!["done", "reading", "skipped"].includes(
                        source.status,
                      ) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setFiles((current) =>
                              current.map((f) =>
                                f.id === source.id
                                  ? { ...f, status: "skipped" }
                                  : f,
                              ),
                            )
                          }
                        >
                          Skip
                        </button>
                      )}
                      {source.status !== "reading" && (
                        <button
                          type="button"
                          aria-label={"Remove " + source.file.name}
                          disabled={busy}
                          onClick={() => {
                            setFiles((current) =>
                              current.filter((f) => f.id !== source.id),
                            );
                            if (source.candidateId)
                              setBookings((current) =>
                                current.filter(
                                  (b) => b.id !== source.candidateId,
                                ),
                              );
                          }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {files.some((f) =>
                    ["waiting", "failed"].includes(f.status),
                  ) && (
                    <div className="onboarding-source-options">
                      <p>
                        Up to 8 files, 3 MB each. PDFs: up to 5 pages. Add each
                        reservation separately. Originals are used for
                        extraction only; attach private copies in Bookings
                        later.
                      </p>
                      {live ? (
                        <>
                          <label className="onboarding-checkbox">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(e) => setConsent(e.target.checked)}
                            />
                            Send these documents to the AI provider to read
                            booking details.
                          </label>
                          <button
                            type="button"
                            className="onboarding-secondary"
                            disabled={busy || !online || !consent}
                            onClick={readFiles}
                          >
                            {busy
                              ? "Reading documents…"
                              : "Read selected bookings"}
                          </button>
                        </>
                      ) : (
                        <p role="status">
                          AI reading isn’t configured yet. Add details manually,
                          or skip these files and continue.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="onboarding-manual-path">
                  <p className="onboarding-or">Or</p>
                  <button
                    type="button"
                    className="onboarding-manual"
                    disabled={busy || destinations.length >= 32}
                    onClick={() =>
                      setDestinations((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          locationId: "",
                          label: "",
                          start,
                          end,
                        },
                      ])
                    }
                  >
                    <strong>
                      <Plus size={18} />
                      Add a destination manually
                    </strong>
                    <span>Add a stop without a reservation</span>
                  </button>
                  {destinations.map((d, index) => (
                    <div className="onboarding-destination" key={d.id}>
                      <LocationPicker
                        label={`Destination ${index + 1}`}
                        initialId={d.locationId}
                        initialLabel={d.label}
                        onResolved={(city) =>
                          setDestinations((current) =>
                            current.map((item) =>
                              item.id === d.id
                                ? {
                                    ...item,
                                    locationId: city?.id || "",
                                    label: city?.label || "",
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <div className="onboarding-two">
                        <label>
                          Arrival
                          <input
                            type="date"
                            value={d.start}
                            min={start}
                            max={end}
                            onChange={(e) =>
                              setDestinations((current) =>
                                current.map((item) =>
                                  item.id === d.id
                                    ? { ...item, start: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Departure
                          <input
                            type="date"
                            value={d.end}
                            min={d.start}
                            max={end}
                            onChange={(e) =>
                              setDestinations((current) =>
                                current.map((item) =>
                                  item.id === d.id
                                    ? { ...item, end: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="onboarding-text-button"
                        onClick={() =>
                          setDestinations((current) =>
                            current.filter((item) => item.id !== d.id),
                          )
                        }
                      >
                        Remove destination
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="onboarding-text-button"
                    disabled={bookings.length >= 20 || busy}
                    onClick={() =>
                      setBookings((current) => [...current, emptyCandidate()])
                    }
                  >
                    <Plus size={15} />
                    Add booking details manually
                  </button>
                </div>
              </div>
              <p className="onboarding-note">
                Only booked your flight? That’s enough to get started.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              {included.length === 0 && bookings.length === 0 && (
                <div className="onboarding-review-empty">
                  <h2>A little room for possibility.</h2>
                  <p>
                    {destinations.length
                      ? "Your manual destinations are ready. No reservations have been added."
                      : "No bookings added yet. You can create your trip and add them later."}
                  </p>
                </div>
              )}
              {bookings.map((b) => (
                <article className="onboarding-review-card" key={b.id}>
                  <div className="onboarding-review-label">
                    <span>
                      {b.fields.category || "Booking"} ·{" "}
                      {b.confirmed && b.reviewed && candidateComplete(b)
                        ? "Confirmed by you"
                        : b.reviewed
                          ? "Reviewed · unverified"
                          : "Unverified details"}
                    </span>
                  </div>
                  <h2>
                    {b.fields.title ||
                      [b.fields.origin, b.fields.destination]
                        .filter(Boolean)
                        .join(" → ") ||
                      "Booking details to review"}
                  </h2>
                  <p>
                    {b.fields.start_date && b.fields.end_date
                      ? friendlyDateRange(
                          b.fields.start_date,
                          b.fields.end_date,
                        )
                      : "Dates not provided"}
                  </p>
                  {!candidateComplete(b) && (
                    <p>
                      Some details are missing. We’ll keep this as a private
                      review draft.
                    </p>
                  )}
                  {b.evidence && Object.keys(b.evidence).length > 0 && (
                    <details>
                      <summary>Source evidence · unverified</summary>
                      <p>
                        These excerpts describe the extraction, before your
                        edits.
                      </p>
                      {Object.entries(b.evidence).map(([key, value]) => (
                        <blockquote key={key}>
                          {importLabels[key as keyof typeof importLabels]}:{" "}
                          {value}
                        </blockquote>
                      ))}
                    </details>
                  )}
                  {b.warnings?.map((warning, index) => (
                    <p key={index}>{warning}</p>
                  ))}
                  <details className="onboarding-edit-details">
                    <summary>Edit</summary>
                    {importFieldNames.map((key) => (
                      <label key={key}>
                        {importLabels[key]}
                        {key === "category" ? (
                          <select
                            value={b.fields.category || ""}
                            onChange={(e) =>
                              updateBooking(b.id, {
                                fields: {
                                  ...b.fields,
                                  category: (e.target.value ||
                                    null) as Candidate["fields"]["category"],
                                },
                                reviewed: false,
                                confirmed: false,
                              })
                            }
                          >
                            <option value="">Not provided</option>
                            {categories.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={
                              key.endsWith("date")
                                ? "date"
                                : key.includes("time")
                                  ? "time"
                                  : ["price", "paid_amount"].includes(key)
                                    ? "number"
                                    : "text"
                            }
                            step={
                              key.includes("amount") || key === "price"
                                ? "0.01"
                                : undefined
                            }
                            maxLength={key === "currency" ? 3 : 500}
                            value={b.fields[key] ?? ""}
                            placeholder="Not provided"
                            onChange={(e) =>
                              updateBooking(b.id, {
                                fields: {
                                  ...b.fields,
                                  [key]:
                                    e.target.value === ""
                                      ? null
                                      : ["price", "paid_amount"].includes(key)
                                        ? Number(e.target.value)
                                        : key === "currency"
                                          ? e.target.value.toUpperCase()
                                          : e.target.value,
                                },
                                reviewed: false,
                                confirmed: false,
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                    <LocationPicker
                      label="Departure / booking city · needed for a saved start time"
                      initialId={b.departureCity}
                      onResolved={(city) =>
                        updateBooking(b.id, {
                          departureCity: city?.id || "",
                          reviewed: false,
                          confirmed: false,
                        })
                      }
                    />
                    <LocationPicker
                      label="Arrival city · needed for a saved arrival time"
                      initialId={b.arrivalCity}
                      onResolved={(city) =>
                        updateBooking(b.id, {
                          arrivalCity: city?.id || "",
                          reviewed: false,
                          confirmed: false,
                        })
                      }
                    />
                  </details>
                  <details className="onboarding-review-choices">
                    <summary>
                      {!b.included
                        ? "Not included"
                        : b.reviewed
                          ? "Details reviewed"
                          : "Review required"}
                    </summary>
                    <label className="onboarding-checkbox">
                      <input
                        type="checkbox"
                        checked={b.included}
                        onChange={(e) =>
                          updateBooking(b.id, { included: e.target.checked })
                        }
                      />
                      Include this booking
                    </label>
                    {b.included && (
                      <>
                        <label className="onboarding-checkbox">
                          <input
                            type="checkbox"
                            checked={b.reviewed}
                            onChange={(e) =>
                              updateBooking(b.id, {
                                reviewed: e.target.checked,
                                confirmed: e.target.checked
                                  ? b.confirmed
                                  : false,
                              })
                            }
                          />
                          I reviewed these details. Unknown values can stay
                          unknown.
                        </label>
                        <label className="onboarding-checkbox">
                          <input
                            type="checkbox"
                            checked={b.confirmed}
                            disabled={!b.reviewed || !candidateComplete(b)}
                            onChange={(e) =>
                              updateBooking(b.id, {
                                confirmed: e.target.checked,
                              })
                            }
                          />
                          I confirm this reservation exists.
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      className="onboarding-text-button"
                      onClick={() =>
                        setBookings((current) =>
                          current.filter((item) => item.id !== b.id),
                        )
                      }
                    >
                      Remove booking from setup
                    </button>
                  </details>
                </article>
              ))}
              <p className="onboarding-note">
                Not recorded here doesn’t mean not booked. Stay and transfer
                details can be added anytime.
              </p>
            </>
          )}
          {step === 3 && (
            <fieldset disabled={submitted || busy}>
              <legend className="sr-only">Travel preferences</legend>
              <p className="onboarding-label">Your budget</p>
              <div
                className="onboarding-budget-options"
                role="radiogroup"
                aria-label="Travel budget preference"
              >
                {(
                  [
                    ["Budget", "Budget-friendly"],
                    ["Comfort", "Balanced"],
                    ["Luxury", "Comfort & experiences"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    className={
                      "onboarding-budget-option " +
                      (style === value ? "selected" : "")
                    }
                    key={value}
                  >
                    <input
                      type="radio"
                      name="travel-style"
                      checked={style === value}
                      onChange={() => setStyle(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="onboarding-label onboarding-interest-label">
                What matters to you?
              </p>
              <div className="onboarding-interests">
                {interests.map((interest) => (
                  <button
                    type="button"
                    aria-pressed={selectedInterests.includes(interest)}
                    key={interest}
                    onClick={() =>
                      setInterests((current) =>
                        current.includes(interest)
                          ? current.filter((i) => i !== interest)
                          : [...current, interest],
                      )
                    }
                  >
                    {interest}
                  </button>
                ))}
              </div>
              <fieldset className="onboarding-pace">
                <legend className="onboarding-label">
                  Preferred travel pace
                </legend>
                {(["Relaxed", "Flexible", "Active"] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="travel-pace"
                      checked={pace === value}
                      onChange={() => setPace(value)}
                    />
                    {value}
                  </label>
                ))}
              </fieldset>
              <details className="onboarding-extra-preferences">
                <summary>Travelers, currency & optional total budget</summary>
                <label>
                  Travelers
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={travelers}
                    onChange={(e) => setTravelers(Number(e.target.value))}
                  />
                </label>
                <label>
                  Currency
                  <input
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </label>
                <label>
                  Total budget · optional
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </label>
              </details>
            </fieldset>
          )}
          {step === 4 && result && (
            <>
              <div className="onboarding-trip-card">
                <span>
                  {flightOnly
                    ? pending.length === included.length
                      ? "Flight review draft"
                      : "Flight details saved"
                    : friendlyDateRange(
                        result.trip.start_date,
                        result.trip.end_date,
                      )}
                </span>
                <h2>
                  {flightOnly
                    ? included[0]?.fields.title ||
                      [
                        included[0]?.fields.origin,
                        included[0]?.fields.destination,
                      ]
                        .filter(Boolean)
                        .join(" → ") ||
                      "Flight details"
                    : result.trip.name}
                </h2>
                {flightOnly ? (
                  <p>
                    {included[0]?.fields.start_date
                      ? friendlyDate(included[0].fields.start_date, true)
                      : "Dates not provided"}{" "}
                    ·{" "}
                    {included[0]?.confirmed && candidateComplete(included[0])
                      ? "Confirmed by you"
                      : "Unverified details"}
                  </p>
                ) : (
                  <p>
                    {destinations.length} destinations ·{" "}
                    {included.length - pending.length} booking records
                    {pending.length
                      ? ` · ${pending.length} private review drafts`
                      : ""}
                  </p>
                )}
              </div>
              {flightOnly && (
                <div className="onboarding-missing-card">
                  <h2>
                    <Plus size={18} />
                    Accommodation
                  </h2>
                  <p>Not added yet — that’s completely fine.</p>
                  <Link href={`/trips/${result.trip.id}?view=bookings`}>
                    Add now or later
                  </Link>
                </div>
              )}
              <p className="onboarding-label">Your workspace</p>
              <div className="onboarding-next-links">
                {[
                  [
                    "destinations",
                    "Journey",
                    "Your destinations and connections",
                  ],
                  ["bookings", "Flights & stays", "Your saved details"],
                  ["itinerary", "Plan your days", "Build a flexible itinerary"],
                  [
                    "map",
                    "Map & nearby places",
                    "Find your saved places and local ideas",
                  ],
                  [
                    "check",
                    "Smart Trip Check",
                    "Review possible gaps in recorded plans",
                  ],
                  ["prep", "Preparation", "Get ready for departure"],
                  ["packing", "Packing list", "Bring the essentials"],
                  ["budget", "Budget", "Plan and track your spending"],
                  [
                    "ideas",
                    "Ideas & recommendations",
                    "Explore at your own pace",
                  ],
                ].map(([view, title, copy]) => (
                  <Link
                    key={view}
                    href={`/trips/${result.trip.id}?view=${view}`}
                  >
                    <span>
                      {view === "bookings" &&
                      included.some(
                        (b) => b.confirmed && candidateComplete(b),
                      ) ? (
                        <Check size={18} />
                      ) : (
                        <Plus size={18} />
                      )}
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{copy}</small>
                    </span>
                  </Link>
                ))}
              </div>
              {pending.length > 0 && (
                <div className="onboarding-missing-card">
                  <h2>Details to finish later</h2>
                  <p>
                    These remain private, unverified review drafts. No booking
                    was invented.
                  </p>
                  {pending.map((b) => (
                    <p key={b.id}>
                      {b.fields.title || "Booking draft"} · incomplete
                    </p>
                  ))}
                  <Link href={`/trips/${result.trip.id}?view=setup-details`}>
                    Open private review drafts
                  </Link>
                </div>
              )}
              {flightOnly && (
                <div className="onboarding-insight">
                  <strong>
                    <Sparkles size={17} />
                    Pfew will help fill the gaps
                  </strong>
                  <p>
                    Save stays, transfers and things to do whenever you’re
                    ready.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="onboarding-bottom">
          {!schemaReady && (
            <p role="status">
              The new setup needs database migration 010 before saving. Your
              existing trips remain available.
            </p>
          )}
          {!online && step < 4 && (
            <p role="status">
              Reconnect to read documents or create your trip.
            </p>
          )}
          {error && (
            <p role="alert" className="onboarding-error">
              {error}
            </p>
          )}
          {step === 4 && result ? (
            <Link className="onboarding-continue" href={result.href}>
              Continue with my trip
              <ArrowRight size={18} />
            </Link>
          ) : (
            <button
              type="button"
              className="onboarding-continue"
              disabled={busy || !online || (step === 3 && !schemaReady)}
              onClick={step === 3 ? create : next}
            >
              {busy
                ? step === 3
                  ? "Creating your trip…"
                  : "Reading documents…"
                : step === 2
                  ? "Confirm details"
                  : step === 3
                    ? submitted
                      ? "Retry creating my trip"
                      : "Create my trip"
                    : "Continue"}
              {step === 3 ? <Sparkles size={16} /> : <ArrowRight size={18} />}
            </button>
          )}
          {step > 0 && step < 4 && !submitted && (
            <button
              type="button"
              className="onboarding-back"
              disabled={busy}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={14} />
              Back
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
