import Link from "next/link";
export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  return (
    <section className="error">
      <h1>Let’s try that again.</h1>
      <p role="alert">{message || "Something went wrong."}</p>
      <Link className="button primary" href="/">
        Back to my trips
      </Link>
    </section>
  );
}
