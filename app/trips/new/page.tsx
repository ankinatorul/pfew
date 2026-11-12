export const dynamic = "force-dynamic";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { access } from "../../../lib/access";
import { CreateTrip } from "../../../components/create-trip";
import { TripReviewClient } from "../../../components/trip-review-client";
import { BookingCollectionClient } from "../../../components/booking-collection-client";
import { loadBookingCollection } from "../../../lib/booking-collection-server";
import { displayTrip } from "../../../lib/finalized-trips";
import type { Trip } from "../../../lib/domain";
import {
  privateDraftSchema,
  missingDraftSchema,
  tripBasicsSchema,
  draftBasics,
} from "../../../lib/trip-drafts";

export default async function New({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    new?: string;
    step?: string;
    legacy?: string;
  }>;
}) {
  const { db, user } = await access();
  const query = await searchParams;
  if (query.legacy === "1") redirect("/trips/new");
  if (
    (query.draft && !z.uuid().safeParse(query.draft).success) ||
    (query.new && !z.uuid().safeParse(query.new).success)
  )
    notFound();
  const { data, error } = await db
    .from("trips")
    .select("*")
    .eq("creation_state", "draft")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error && !missingDraftSchema(error))
    return (
      <section className="create-trip">
        <h1>Your drafts couldn’t be loaded.</h1>
        <p>
          Check your connection and refresh. Your saved drafts have not been
          changed.
        </p>
        <Link className="button secondary" href="/trips/new">
          Try again
        </Link>
      </section>
    );
  const parsed = privateDraftSchema.array().safeParse(data || []);
  if (!parsed.success)
    return (
      <section className="create-trip">
        <h1>Your drafts need a second look.</h1>
        <p>
          The saved draft format could not be read safely. Ask your developer to
          check it; nothing has been overwritten.
        </p>
      </section>
    );
  const drafts = parsed.data;
  const draft = query.draft
    ? drafts.find((item) => item.id === query.draft)
    : undefined;
  if (query.draft && !draft) {
    // Recover a lost success response or refresh without showing an editable draft.
    const { data: completed } = await db
      .from("trips")
      .select("*")
      .eq("id", query.draft)
      .eq("owner_id", user.id)
      .eq("creation_state", "finalized")
      .maybeSingle();
    const basics = tripBasicsSchema.safeParse({
      ...completed,
      destinations: completed?.draft_data?.destinations,
    });
    if (!completed?.draft_data?.finalization_receipt || !basics.success)
      notFound();
    return (
      <section className="create-trip">
        <TripReviewClient
          key={completed.id}
          userId={user.id}
          trip={displayTrip(completed)}
          basics={basics.data}
          revision={completed.draft_revision}
          entries={[]}
          ready
          finalized
        />
      </section>
    );
  }
  const id = draft?.id || query.new || randomUUID();
  if (
    draft &&
    query.step !== "1" &&
    tripBasicsSchema.safeParse(draftBasics(draft)).success
  ) {
    const collection = await loadBookingCollection(db, id);
    const step =
      query.step === "2"
        ? 2
        : query.step === "3"
          ? 3
          : draft.draft_step >= 3
            ? 3
            : 2;
    const tripRow = (data || []).find((row) => row.id === id) as Trip;
    const trip = displayTrip(tripRow);
    if (step === 2)
      return (
        <section className="create-trip">
          <BookingCollectionClient
            key={id}
            trip={trip}
            initialEntries={collection.entries}
            initialAttachments={collection.attachments}
            ready={collection.ready}
            paymentDueReady={
              !(await db.from("bookings").select("payment_due_date").limit(0))
                .error
            }
            setupError={collection.error}
            live={
              process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY)
            }
          />
        </section>
      );
    const capability = await db.from("trips").select("theme").limit(0);
    return (
      <section className="create-trip">
        <TripReviewClient
          key={id}
          userId={user.id}
          trip={trip}
          basics={draftBasics(draft)}
          revision={draft.draft_revision}
          entries={collection.entries}
          ready={collection.ready && !capability.error}
          setupError={
            collection.error ||
            (capability.error
              ? "Final trip creation needs the reviewed migrations in a separate development database. Nothing was applied to the live project."
              : "")
          }
        />
      </section>
    );
  }
  return (
    <section className="create-trip">
      <CreateTrip
        userId={user.id}
        id={id}
        draft={draft}
        drafts={drafts}
        ready={!error}
        explicit={Boolean(query.new || draft)}
      />
    </section>
  );
}
