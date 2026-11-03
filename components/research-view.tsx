import { access } from "../lib/access";
import type { Trip, Segment } from "../lib/domain";
import type { ResearchNote } from "../lib/research-types";
import { Research } from "./research";
export async function ResearchView({
  trip,
  segments,
  canEdit,
}: {
  trip: Trip;
  segments: Segment[];
  canEdit: boolean;
}) {
  const { db } = await access(),
    { data, error } = await db
      .from("research_notes")
      .select("*")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false });
  if (error?.code === "PGRST205" || error?.code === "42P01")
    return (
      <section className="card">
        <h2>Research needs a database update.</h2>
        <p>
          Apply migration 009 to enable source notes and reviewed booking
          imports. Your existing trip data stays available.
        </p>
      </section>
    );
  if (error) throw new Error("Could not load source notes");
  return (
    <Research
      trip={trip}
      destinations={segments.filter((item) => item.kind === "destination")}
      notes={(data || []) as ResearchNote[]}
      canEdit={canEdit}
    />
  );
}
