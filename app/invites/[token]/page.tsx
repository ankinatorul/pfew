import Link from "next/link";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
// Per-person/email-bound invitations are retired, never converted into bearer
// links. No token lookup, acceptance or trip details are exposed on this route.
export default function Invitation() {
  return (
    <section className="invitation-page">
      <h1>This invitation link has been retired</h1>
      <p>Ask the trip owner for the current sharing link.</p>
      <Link className="button" href="/trips">
        My Trips
      </Link>
    </section>
  );
}
