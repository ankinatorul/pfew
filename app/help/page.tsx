import Link from "next/link";
import { access } from "../../lib/access";

export default async function Help() {
  await access();
  return (
    <section className="card">
      <span className="eyebrow">A little guidance</span>
      <h1>Help &amp; Support</h1>
      <p>
        Choose a current trip to open its itinerary, bookings, packing lists,
        and your private documents.
      </p>
      <p>
        Inside a trip, the trip tools on desktop or More on mobile also open
        Budget, Prep, Map, Research, People, and Offline.
      </p>
      <p>
        Documents belong to their uploader. Attach new files from a booking, or
        manage your uploads from Your account.
      </p>
      <div className="actions">
        <Link className="button secondary" href="/profile/checks">
          Check app setup
        </Link>
        <Link className="button secondary" href="/profile">
          Your account
        </Link>
        <Link className="button secondary" href="/trips">
          Find a trip
        </Link>
      </div>
    </section>
  );
}
