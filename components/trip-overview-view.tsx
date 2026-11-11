import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  Backpack,
  CalendarDays,
  Check,
  CircleHelp,
  Files,
  Lightbulb,
  MapPin,
  Pencil,
  Tickets,
  Users,
  Wallet,
} from "lucide-react";
import type { TripOverview } from "../lib/trip-overview";
import type { TripRole } from "../lib/trip-role";
import { tripSectionUrl } from "../lib/trip-navigation";
import { DuringTripSections } from "./during-trip-plan";
import { TripRecap } from "./trip-recap";

export function TripOverviewView({
  model,
  role,
  taskActions = {},
  findingActions = {},
  LinkComponent = "a",
}: {
  model: TripOverview;
  role: TripRole;
  taskActions?: Record<string, ReactNode>;
  findingActions?: Record<string, ReactNode>;
  LinkComponent?: ElementType;
}) {
  const completed = model.phase === "past";
  const href = (view: string) =>
    tripSectionUrl(model.tripId, view, model.dates.day);
  const money = (amount: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: model.currency,
      currencyDisplay: "code",
    }).format(amount);
  const modules = [
    {
      key: "bookings",
      label: "Bookings",
      icon: Tickets,
      tone: "cobalt",
      value: model.bookings
        ? model.bookings.total
          ? `${model.bookings.total} saved`
          : "No bookings saved"
        : "Summary unavailable",
      detail: model.bookings
        ? model.bookings.total
          ? `${model.bookings.confirmed} user-confirmed`
          : completed
            ? "Your saved travel wallet"
            : "Keep your reservation details handy"
        : "Open your saved bookings",
    },
    {
      key: "itinerary",
      label: "Itinerary",
      icon: CalendarDays,
      tone: "lavender",
      value: completed
        ? model.itinerary.total
          ? `${model.itinerary.total} saved ${model.itinerary.total === 1 ? "plan" : "plans"}`
          : "No itinerary entries saved"
        : model.itinerary.total
          ? `${model.itinerary.total} dated plans`
          : "No dated plans yet",
      detail: model.itinerary.ideas
        ? `${model.itinerary.ideas} unscheduled ideas`
        : completed
          ? "Open your saved itinerary"
          : "Make room for your days",
    },
    {
      key: "packing",
      label: "Packing",
      icon: Backpack,
      tone: "orange",
      value: model.packing
        ? model.packing.total
          ? `${Math.round((model.packing.packed / model.packing.total) * 100)}% packed`
          : model.packing.lists
            ? "No items saved"
            : completed
              ? "No packing lists saved"
              : "No packing list yet"
        : "Summary unavailable",
      detail: model.packing?.total
        ? `${model.packing.packed} of ${model.packing.total} items packed`
        : completed
          ? "Open saved packing"
          : "Choose a checklist that fits",
    },
    {
      key: "documents",
      label: "Documents",
      icon: Files,
      tone: "cobalt",
      value: model.documents
        ? model.documents.ready
          ? `${model.documents.ready} private ${model.documents.ready === 1 ? "file" : "files"}`
          : "No private uploads"
        : "Summary unavailable",
      detail: model.documents?.pending
        ? `${model.documents.pending} incomplete ${model.documents.pending === 1 ? "upload" : "uploads"}`
        : "Only your uploads are shown",
    },
    {
      key: "budget",
      label: "Budget",
      icon: Wallet,
      tone: "lavender",
      value: model.target === null
        ? "No target set"
        : (completed ? "Target " : "") + money(model.target),
      detail: model.budget
        ? completed && model.hasBudgetRecords === false
          ? "No budget records saved"
          : `Planned ${money(model.budget.planned)}`
        : "Budget summary unavailable",
    },
  ];
  const cards = completed
    ? ["itinerary", "bookings", "documents", "budget", "packing"].map(
        key => modules.find(module => module.key === key)!,
      )
    : modules;
  return (
    <div
      className={"trip-overview" + (role === "viewer" ? " trip-viewer" : "")}
    >
      <header className="overview-header">
        <div className="overview-heading">
          <LinkComponent className="overview-back" href="/trips">
            My Trips <span aria-hidden="true">/</span>
          </LinkComponent>
          <div className="overview-title-line">
            <h1>{model.name}</h1>
            {role === "owner" && (
              <LinkComponent className="overview-edit-link" href={href("settings")}>
                <Pencil size={14} aria-hidden="true" />
                Edit trip
              </LinkComponent>
            )}
          </div>
          <p className="overview-destination">
            <MapPin size={15} aria-hidden="true" />
            {model.destination || "Destination not saved"}
            {model.destinations.length > 1 &&
              ` · +${model.destinations.length - 1} more`}
          </p>
          <p className="overview-date-line">
            {model.dates.label}
            {model.dates.countdown !== null && (
              <span className="overview-countdown">
                {model.dates.countdown === 1
                  ? "Tomorrow"
                  : `${model.dates.countdown} days to go`}
              </span>
            )}
            {model.during && <span className="overview-status">Traveling now{model.during.dayNumber !== null ? ` · Day ${model.during.dayNumber}` : ""}</span>}
            {model.phase === "unknown" && <span className="overview-status">Travel dates need checking</span>}
            {completed && <span className="overview-status">Completed trip</span>}
          </p>
        </div>
      </header>
      {role === "viewer" && (
        <p className="overview-viewer-note" role="status">
          You have view-only access to this shared trip.
        </p>
      )}
      <nav className="overview-tabs" aria-label="Trip overview sections">
        {[{ key: "hub", label: "Overview" }, ...modules].map((item) => (
          <LinkComponent
            key={item.key}
            href={href(item.key)}
            aria-current={item.key === "hub" ? "page" : undefined}
          >
            {item.label}
          </LinkComponent>
        ))}
      </nav>
      <div className="overview-preparation-grid">
        {completed ? (
          <TripRecap model={model} LinkComponent={LinkComponent} />
        ) : model.during ? (
          <DuringTripSections plan={model.during} tripId={model.tripId} role={role} LinkComponent={LinkComponent} />
        ) : model.phase === "unknown" ? (
          <section className="overview-card" aria-labelledby="overview-date-review-title">
            <h2 id="overview-date-review-title">Review your travel dates</h2>
            <p className="overview-note">The saved dates or timezone don’t establish whether this trip is underway. Your saved plans remain available in Itinerary.</p>
            <LinkComponent className="overview-primary-link" href={href(role === "owner" ? "settings" : "itinerary")}>{role === "owner" ? "Review trip details" : "View itinerary"}<ArrowRight size={16} aria-hidden="true" /></LinkComponent>
            {role !== "owner" && <p className="overview-note">Ask the trip owner to review the travel dates.</p>}
          </section>
        ) : <section
          className="overview-card overview-preparation"
          aria-labelledby="overview-preparation-title"
        >
          <div className="overview-section-heading">
            <div>
              <span className="overview-kicker">
                A little ready goes a long way
              </span>
              <h2 id="overview-preparation-title">What’s left to do</h2>
            </div>
            <Check size={20} aria-hidden="true" />
          </div>
          {model.dates.duration === null && (
            <p className="overview-note">
              {role === "owner" ? (
                <>
                  Review your dates in{" "}
                  <LinkComponent href={href("settings")}>
                    Trip settings
                  </LinkComponent>{" "}
                  before scheduling plans.
                </>
              ) : (
                "Ask the trip owner to review the dates before scheduling plans."
              )}
            </p>
          )}
          {model.tasks ? (
            <>
              <p className="overview-task-progress">
                {model.tasks.completed} of {model.tasks.total} saved prep tasks
                complete
              </p>
              {model.tasks.open.length ? (
                <ul
                  className="overview-task-list"
                  aria-label="Saved incomplete tasks"
                >
                  {model.tasks.open.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <span
                        className="overview-task-circle"
                        aria-hidden="true"
                      />
                      <div className="overview-row-copy">
                        <span className="overview-kind">Saved task</span>
                        <h3>{task.title}</h3>
                        <p>
                          {task.due_date
                            ? `Due ${task.due_date}`
                            : "No due date"}{" "}
                          · {task.priority} priority
                        </p>
                      </div>
                      {role !== "viewer" && taskActions[task.id] && (
                        <div
                          className="overview-task-action"
                          role="group"
                          aria-label={task.title}
                        >
                          {taskActions[task.id]}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="overview-note">
                  No incomplete prep tasks are saved. You can review optional
                  starters in Prep.
                </p>
              )}
              {model.tasks.open.length > 3 && (
                <LinkComponent
                  className="overview-text-link"
                  href={href("prep")}
                >
                  View all {model.tasks.open.length} open tasks{" "}
                  <ArrowRight size={15} aria-hidden="true" />
                </LinkComponent>
              )}
            </>
          ) : (
            <p className="overview-note" role="status">
              Saved preparation tasks could not be loaded.{" "}
              <LinkComponent href={href("prep")}>Open Prep</LinkComponent> to
              try again.
            </p>
          )}
          {model.suggestions.length > 0 && (
            <div className="overview-suggestions">
              <h3>Worth a quick look</h3>
              <p className="overview-note">
                Suggestions use saved information. You may already have
                arrangements outside Pfew.
              </p>
              <ul aria-label="Optional preparation suggestions">
                {model.suggestions.map((suggestion) => (
                  <li key={suggestion.key}>
                    <Lightbulb size={18} aria-hidden="true" />
                    <div className="overview-row-copy">
                      <span className="overview-kind overview-kind-suggestion">
                        Suggested action
                      </span>
                      <h4>{suggestion.title}</h4>
                      <details>
                        <summary>Why this suggestion?</summary>
                        <p>{suggestion.detail}</p>
                        <p>{suggestion.uncertainty}</p>
                      </details>
                    </div>
                    <div className="overview-suggestion-actions">
                      <LinkComponent
                        className="overview-text-link"
                        href={href(suggestion.view)}
                      >
                        Review <ArrowRight size={15} aria-hidden="true" />
                      </LinkComponent>
                      {role !== "viewer" && findingActions[suggestion.key]}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="overview-footnote">
                {role === "viewer" ? (
                  <>
                    These suggestions are optional. An owner or editor can
                    review additions and save findings in{" "}
                    <LinkComponent href={href("check")}>
                      Trip Check
                    </LinkComponent>
                    .
                  </>
                ) : (
                  <>
                    Review additions before saving. Handle saved findings in{" "}
                    <LinkComponent href={href("check")}>
                      Trip Check
                    </LinkComponent>
                    .
                  </>
                )}
              </p>
            </div>
          )}
          {!model.checkAvailable && (
            <p className="overview-note">
              Saved Trip Check decisions could not be read; those suggestions
              are unavailable.
            </p>
          )}
          <LinkComponent className="overview-primary-link" href={href("prep")}>
            Review preparation <ArrowRight size={16} aria-hidden="true" />
          </LinkComponent>
        </section>}
        <section
          className="overview-card overview-glance"
          aria-labelledby="overview-glance-title"
        >
          <h2 id="overview-glance-title">Trip at a glance</h2>
          <dl>
            <div>
              <dt>
                <MapPin size={18} aria-hidden="true" />
                <span className="sr-only">Destination</span>
              </dt>
              <dd>{model.destination || "Not saved yet"}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={18} aria-hidden="true" />
                <span className="sr-only">Dates</span>
              </dt>
              <dd>
                {model.dates.label}
                {model.dates.duration !== null && (
                  <small>
                    {model.dates.duration}{" "}
                    {model.dates.duration === 1 ? "day" : "days"}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>
                <Users size={18} aria-hidden="true" />
                <span className="sr-only">Travelers</span>
              </dt>
              <dd>
                {model.travelers !== null
                  ? `${model.travelers} ${model.travelers === 1 ? "traveler" : "travelers"}`
                  : "Not specified"}
              </dd>
            </div>
            {model.destinations.length > 1 && (
              <div>
                <dt>
                  <MapPin size={18} aria-hidden="true" />
                  <span className="sr-only">Destinations</span>
                </dt>
                <dd>{model.destinations.length} saved destinations</dd>
              </div>
            )}
          </dl>
          <LinkComponent
            className="overview-text-link"
            href={href("destinations")}
          >
            Review destinations <ArrowRight size={15} aria-hidden="true" />
          </LinkComponent>
        </section>
      </div>
      <section className="overview-modules" aria-label="Trip modules">
        {cards.map(({ key, label, icon: Icon, tone, value, detail }) => (
          <LinkComponent
            className="overview-card overview-module"
            key={key}
            href={href(key)}
          >
            <span
              className={"overview-module-icon overview-tone-" + tone}
              aria-hidden="true"
            >
              <Icon size={20} />
            </span>
            <h3>{label}</h3>
            <p className="overview-module-value">{value}</p>
            <small>{detail}</small>
            {key === "packing" && model.packing && model.packing.total > 0 && (
              <progress
                aria-label="Packing progress"
                value={model.packing.packed}
                max={model.packing.total}
              />
            )}
            {key === "budget" && model.budget && (!completed || model.hasBudgetRecords) && (
              <>
                <small>
                  Prepaid {money(model.budget.prepaid)} ·{" "}
                  {model.includePrepaid
                    ? "included in target"
                    : "outside target"}
                </small>
                <small>
                  {model.budget.actual
                    ? `${completed ? "Recorded" : "Actual"}: ${Object.entries(model.budget.actual)
                        .map(
                          ([currency, amount]) =>
                            `${currency} ${amount.toFixed(2)}`,
                        )
                        .join(" · ")}`
                    : completed ? "No spending recorded" : "Actual spending not tracked"}
                </small>
              </>
            )}
          </LinkComponent>
        ))}
      </section>
      <nav className="overview-secondary-tools" aria-label="More trip tools">
        <CircleHelp size={17} aria-hidden="true" />
        <span>A little more for your trip</span>
        {[
          { key: "map", label: "Map" },
          { key: "check", label: "Trip Check" },
          { key: "research", label: "Research" },
          { key: "people", label: "People" },
          { key: "offline", label: "Offline" },
        ].map((item) => (
          <LinkComponent key={item.key} href={href(item.key)}>
            {item.label}
            <ArrowRight size={13} aria-hidden="true" />
          </LinkComponent>
        ))}
      </nav>
    </div>
  );
}
