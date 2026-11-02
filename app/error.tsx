"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="error">
      <h2>A little bump in the road.</h2>
      <p>
        We couldn’t load this page. Check your connection and database
        configuration, then try again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
