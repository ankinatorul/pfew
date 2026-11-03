export const dynamic = "force-dynamic";
import { access } from "../../../lib/access";
import { TripForm } from "../../../components/forms";
export default async function New() {
  const { db } = await access();
  const { error } = await db
    .from("trip_segments")
    .select("location_id")
    .limit(0);
  if (error)
    return (
      <section className="card">
        <h1>A little setup before takeoff.</h1>
        <p>
          The database needs the automatic locations migration (005). Your
          existing trips remain available.
        </p>
      </section>
    );
  return (
    <>
      <span className="eyebrow">Something to look forward to</span>
      <h1>Let’s get you going.</h1>
      <p>A few essentials now. All the possibilities later.</p>
      <TripForm />
    </>
  );
}
