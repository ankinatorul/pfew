import Link from "next/link";
export default function Missing() {
  return (
    <section className="hero">
      <h1>A little off the map.</h1>
      <p>This trip doesn’t exist, or you don’t have access to it.</p>
      <Link className="button primary" href="/">
        Back to my trips
      </Link>
    </section>
  );
}
