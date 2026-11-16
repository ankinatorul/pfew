import { TripCollection } from "../../components/trip-collection";
import { access } from "../../lib/access";
import { shellTrips } from "../../lib/shell-data";

export const dynamic = "force-dynamic";
export default async function Trips() {
  const { user } = await access();
  const { trips, unavailable } = await shellTrips(user.id);
  if (unavailable)
    throw new Error("Trips could not be loaded. Check your connection.");
  return (
    <>
      <span className="eyebrow">All your adventures</span>
      <h1>My Trips</h1>
      <TripCollection trips={trips} />
    </>
  );
}
