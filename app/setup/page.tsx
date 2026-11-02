import Link from "next/link";
export default function Setup() {
  return (
    <div className="setup">
      <section className="hero">
        <span className="eyebrow">A good trip starts here</span>
        <h1>
          Your next chapter.
          <br />
          All in one place.
        </h1>
        <p>
          Meet Pfew. A calmer home for your destinations, stays, journeys, and
          little plans along the way.
        </p>
        <span className="pill">Phase 1 · Connect your workspace</span>
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <h2>One connection before takeoff.</h2>
        <p>
          This application uses real Supabase persistence. Connect a project to
          start creating private trips.
        </p>
        <ol className="list-decimal pl-6 space-y-3">
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and set
            the Supabase URL, publishable key, and site URL.
          </li>
          <li>
            Apply <code>supabase/migrations/001_foundation.sql</code> in your
            Supabase SQL editor.
          </li>
          <li>
            Enable Google and email authentication. Allow your site’s{" "}
            <code>/auth/callback</code> URL in Supabase.
          </li>
          <li>Restart the development server, then sign in.</li>
        </ol>
        <p className="muted">
          No credentials or sample reservations have been invented. Your first
          trip will start empty.
        </p>
        <Link className="button primary" href="/login">
          Continue to sign in →
        </Link>
      </section>
    </div>
  );
}
